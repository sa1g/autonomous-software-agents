import { DeliverooApi } from "../deliveroo-api/deliveroo-api.js";
import Tile from "../environment/tile.js";
import { Coordinates } from "../environment/utils.js";
import WorldMap from "../environment/world.js";
import { PddlSolver } from "../pddl-api/pddl-api.js";
import AbsAgent from "./absAgent.js";

export default class DeliverooAgent extends AbsAgent {
    constructor(client: DeliverooApi, solver: PddlSolver, worldMap: WorldMap) {
        super(client, solver, worldMap);
    }

    async getIntention(): Promise<any[]> {
        let carriedQty = this.worldMap.parcels.carriedQty();
        let carriedReward = this.worldMap.parcels.carriedReward();

        // Determine the closest reachable delivery point
        let possibleDeliveries: Coordinates[] = this.worldMap.nearestDelivery({ x: this.me.x, y: this.me.y });
        let nearestDelivery = null;
        let deliveryLength = Infinity;

        for (const delivery of possibleDeliveries) {
            const path = this.worldMap.getPath(this.me as Tile, delivery as Tile);
            if (path.length != 0 && path.length < deliveryLength) {
                nearestDelivery = delivery;
                deliveryLength = path.length;
            }
        }

        if (carriedQty >= this.serverConfig.PARCELS_MAX && carriedQty != 0) {
            //console.log("DELIVER")
            return [this.Plans.DELIVER];
        }

        let directDeliveryReward = carriedReward - deliveryLength;
        const options: any[] = [];
        const rewards: number[] = [];
        const filPar = {};

        let agents = this.worldMap.agents.getAgents();

        for (const parcel of this.worldMap.parcels.getParcels().values()) {
            let tile = this.worldMap.get(parcel.x, parcel.y) as Tile;
            if (tile.isAgentPresent) {
                continue;
            }

            const meDistance = this.worldMap.getDistance(
                { x: this.me.x, y: this.me.y } as Tile,
                { x: parcel.x, y: parcel.y } as Tile
            );

            let newParcelReward = carriedReward +
                parcel.reward -
                meDistance -
                this.worldMap.getDistance(
                    { x: parcel.x, y: parcel.y } as Tile,
                    nearestDelivery as Tile
                );

            if (parcel.carriedBy) {
                if (parcel.carriedBy == this.id) {
                    //console.log("DELIVER")
                    options.push([this.Plans.DELIVER]);
                    rewards.push(newParcelReward);
                }
                continue;
            }

            let minDistance: number = Infinity;

            for (const [agentId, agent] of agents.entries()) {
                const agentDistance = this.worldMap.getDistance(
                    { x: parcel.x, y: parcel.y } as Tile,
                    agent.getLastPosition() as Tile
                );

                if (agentDistance < minDistance) {
                    minDistance = agentDistance;
                }
            }

            if (meDistance > minDistance) {
                continue;
            }

            filPar[parcel.id] = [parcel, meDistance];

            if (newParcelReward >= directDeliveryReward && carriedQty < this.serverConfig.PARCELS_MAX) {
                //console.log("PICKUP")
                options.push([this.Plans.PICKUP, parcel.x, parcel.y]);
                rewards.push(newParcelReward);
            }
        }

        if (options.length === 0) {
            //console.log("Random")
            return [this.Plans.RANDOM];
        }

        // Choose the option with the highest reward
        const index = rewards.indexOf(Math.max(...rewards));
        const bestOpt: any[] = options[index];

        // Check if there are parcels on the path to the best option
        if (bestOpt[0] == this.Plans.PICKUP) {
            let onThePath = [];
            let pathToSelectedOption = this.worldMap.getPath(
                this.me as Tile,
                { x: bestOpt[1], y: bestOpt[2] } as Tile
            );

            for (let i = 0; i < pathToSelectedOption.length; i++) {
                for (const parcel of this.worldMap.parcels.getParcels().values()) {
                    if (parcel.carriedBy || parcel.id in filPar) {
                        continue;
                    }

                    if (pathToSelectedOption[i].x === parcel.x && pathToSelectedOption[i].y === parcel.y) {
                        onThePath.push(parcel);
                    }
                }
            }

            if (onThePath.length > 0) {
                onThePath.sort((a, b) => b.reward - a.reward);
                let selectedParcels = onThePath.slice(0, this.serverConfig.PARCELS_MAX - carriedQty);
                if (selectedParcels.length > 0) {
                    bestOpt.push(selectedParcels.map(parcel => [parcel.x, parcel.y]));
                }
            }
        }

        return bestOpt;
    }

    mapIntention(intention: any[]) {
        if (intention[0] === this.Plans.DELIVER) {
            return this.goDeliver();
        } else if (intention[0] === this.Plans.PICKUP) {
            return this.goPickUp({ x: intention[1], y: intention[2] });
        } else if (intention[0] === this.Plans.RANDOM) {
            return this.randomMove();
        }
    }

    private async randomMove(): Promise<boolean> {
        const destination = this.worldMap.heatMap.getRandomPosition();
        let path = await this.worldMap.getPathPddl(this.me, destination, true);

        try {
            if (this.cancelCurrentAction) {
                return false;
            }
            await this.move(path);
                       
            return true

        } catch (error) {
            return false;
        }
    }

    private async goPickUp(destination: Coordinates): Promise<boolean> {
        let path = await this.worldMap.getPathPddl(this.me, destination, true);
        try {
            if (this.cancelCurrentAction) {
                return false;
            }
            let res = await this.move(path);
            while (res == false) {
                path = await this.worldMap.search_astar(this.me as Tile, destination as Tile);
                res = await this.move(path);
            }
            let res1 = await this.client.pickup();
            if (res1) {
                return true;
            } else { return false }
        } catch (error) {
            return false;
        }
    }
    /** Go deliver to the closest delivery point. If delivery fails %3times
     * it's redireted to the next closest delivery point (in a round-robin fashion)
     * for max 7 times. If the delivery fails 7 times, the agent stops trying to deliver
     * and returns false. Also if the agent is cancelled, it returns false.
     * 
     * The agent waits for 300ms after the first 3 failed attempts, 600ms after the next 2 failed attempts.
     * 
     * @returns boolean: true if the delivery was successful, false otherwise
     */
    private async goDeliver(): Promise<boolean> {
        let deliveryTiles = await this.worldMap.nearestDelivery(this.me);
        let currentIndex = 0;
        let counter = 0;
        let wait = 150;


        try {
            while (true) {
                const deliveryTile = deliveryTiles[currentIndex]
                let path = await this.worldMap.getPathPddl(this.me, deliveryTile, true);

                if (this.cancelCurrentAction) { return false; }

                let result = await this.move(path);

                if (result) { break; }

                if (counter % 3 == 0) {
                    currentIndex = (currentIndex + 1) % deliveryTiles.length;
                }

                if (counter >= 3 && counter < 5) {

                    wait = 300;
                } else if (counter >= 5 && counter < 7) {
                    wait = 600;
                } else if (counter >= 7) {
                    return false;
                }

                await new Promise((res) => setTimeout(res, wait));   
            }

            await this.client.putdown();
            return true;

        } catch (error) {
            return false;
        }
    }

}