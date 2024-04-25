import { DeliverooApi } from "../deliveroo-api/deliveroo-api.js";
import Tile from "../environment/tile.js";
import { Colors, Coordinates } from "../environment/utils.js";
import WorldMap from "../environment/world.js";
import { PddlSolver } from "../pddl-api/pddl-api.js";
import AbsAgent from "./absAgent.js";
import { Job } from "../environment/utils.js";
import { MessageType, MessageAction } from "../communication/messageType.js";
import { Movements } from "../deliveroo-api/deliveroo-api.js";

export default class MasterSlaveAgent extends AbsAgent {
    protected myJob: string = undefined;

    private fire_point_me_distance: number = undefined;
    private fire_point_teamMate_distance: number = undefined;
    private best_fire_point: Coordinates = undefined;
    private movement_near_fp: Movements[] = [];
    private delivery_me_distance: number = undefined;
    private delivery_teamMate_distance: number = undefined;
    private me_connection_Time: number = undefined
    private teamMate_connection_Time: number = undefined
    private agent_connect = undefined;
    private skip_Master: boolean = false;
    private skip_Slave: boolean = false;


    constructor(client: DeliverooApi, solver: PddlSolver, teamid: string = undefined, worldMap: WorldMap) {
        super(client, solver, worldMap);

        this._teamid = teamid;
        this.myJob = Job.SingleAgent;

        this.initialize();
    }

    public start() {
        this.me_connection_Time =  ((new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000) + new Date().getMilliseconds();
        
        //Continue to send a message asking if other agent is connected. It stops when agent reply.
        const intervalId = setInterval(async () => {
            this.agent_connect = await this.client.ask(this._teamid, JSON.stringify(new MessageType(MessageAction.CONNECT)));

            if (this.agent_connect === "ok") {
                clearInterval(intervalId);
            }
        }, this.serverConfig.CLOCK * 2);

        super.start();
    }

    private async initialize() {
        this.client.onMsg((id, name, msg, reply) => {
            msg = JSON.parse(msg)
            // manage message only if it sent from team Mate
            if (id == this._teamid)
                this.manage_messages(msg, reply)
        })
    }
    //Manage the message received from the other agent
    public async manage_messages(msg: any, reply: any) {
        // if SingleAgent receive a message from other agent
        if (this.myJob == Job.SingleAgent) {
            if (msg.action == MessageAction.FIRE_POINT_DISTANCE) {
                this.fire_point_teamMate_distance = msg.x
                this.delivery_teamMate_distance = msg.y
                this.teamMate_connection_Time = msg.Time
            } else if (msg.action == MessageAction.CONNECT) {
                if (reply) {
                    try { reply("ok") } catch { (error) => console.error(error) }
                }
            }
        }

        // if Master Agent receive a message from Slave
        if (this.myJob == Job.MasterAgent) {
            if (msg.action == MessageAction.DELIVER) {
                if (this.best_fire_point.x != msg.x && this.best_fire_point.y != msg.y){
                    this.best_fire_point.x = msg.x
                    this.best_fire_point.y = msg.y
                }

            }
            else if (msg.action == MessageAction.COME) {
                let path = this.worldMap.search_astar(this.me as Tile, { x: msg.x, y: msg.y } as Tile)
                await this.move(path)

            } else if (msg.action == MessageAction.WAIT) {
                if (reply)
                    try {
                        reply("ok")
                    } catch {
                        (error) => console.error(error)
                    }

                for (const dir of this.movement_near_fp) {
                    let result_move = await this.client.move(dir);
                    
                    if (result_move == false) {
                        continue;
                    } else { break }

                }
                this.cancelCurrentAction = true;
                this.skip_Master = false;
            }
        }

        // if Slave Agent receive a message from Master
        if (this.myJob == Job.SlaveAgent) {
            if (msg.action == MessageAction.WAIT) {
                if (reply)
                    try {
                        reply("ok")
                    } catch {
                        (error) => console.error(error)
                    }

                for (const dir of this.movement_near_fp) {
                    let result_move = await this.client.move(dir);
                    if (result_move == false) {
                        continue;
                    } else { break }
                }
            }

            if (msg.action == MessageAction.PICKUP) {
                await this.goPickUp({ x: msg.x, y: msg.y });
            }

            if (msg.action == MessageAction.PICKED) {
                this.skip_Slave = true;
            }
        }
    }


    private sortByDistance(fp_list: Coordinates[], referenceTile: Tile): Coordinates[] {
        // Calculate distances synchronously
        const fpWithDistances = fp_list.map(fp => {
            const distance = this.worldMap.getDistance(referenceTile, { x: fp.x, y: fp.y } as Tile); // Assuming this is synchronous now
            return { ...fp, distance };
        });

        // Sort based on distances
        fpWithDistances.sort((a, b) => a.distance - b.distance);

        // Return sorted list without distances
        return fpWithDistances.map(fp => ({ x: fp.x, y: fp.y }));
    }

    // Function used to assigna Job (Master or Slave) to a Single agent
    // See distance to fire point, delivery and connection time
    private async getJob(): Promise<string> {
        let fp_list = this.worldMap.firePoint.firePoint.get(19) as Tile[];
        let deliveryTiles = this.worldMap.nearestDelivery(this.me);
        let firstdeliveryPoint = deliveryTiles[0] as Tile

        let fp_list_sorted = this.sortByDistance(fp_list, firstdeliveryPoint)

        if (fp_list_sorted.length > 1)
            this.best_fire_point = fp_list_sorted[Math.floor((fp_list_sorted.length - 1) / 2)]
        else
            this.best_fire_point = fp_list_sorted[0]

        this.fire_point_me_distance = this.worldMap.getDistance(this.me as Tile, this.best_fire_point as Tile)
        this.delivery_me_distance = this.worldMap.getDistance(this.me as Tile, firstdeliveryPoint)
        this.movement_near_fp = []
        let up = this.worldMap.get(this.best_fire_point.x, this.best_fire_point.y + 1) as Tile
        let down = this.worldMap.get(this.best_fire_point.x, this.best_fire_point.y - 1) as Tile
        let left = this.worldMap.get(this.best_fire_point.x - 1, this.best_fire_point.y) as Tile
        let right = this.worldMap.get(this.best_fire_point.x + 1, this.best_fire_point.y) as Tile

        if (down.isWalkable == true)
            this.movement_near_fp.push(Movements.DOWN)
        if (left.isWalkable == true)
            this.movement_near_fp.push(Movements.LEFT)
        if (right.isWalkable == true)
            this.movement_near_fp.push(Movements.RIGHT)
        if (up.isWalkable == true)
            this.movement_near_fp.push(Movements.UP)
        await this.client.say(this._teamid, JSON.stringify(new MessageType(MessageAction.FIRE_POINT_DISTANCE, this.fire_point_me_distance, this.delivery_me_distance, this.me_connection_Time)));



        if (this.fire_point_teamMate_distance != undefined && this.delivery_teamMate_distance != undefined) {
            if (this.fire_point_me_distance < this.fire_point_teamMate_distance) {
                if (this.delivery_me_distance <= this.delivery_teamMate_distance) {
                    return Job.SlaveAgent
                }
                else if (this.delivery_me_distance > this.delivery_teamMate_distance) {
                    return Job.MasterAgent
                }
            }
            else if (this.fire_point_me_distance >= this.fire_point_teamMate_distance) {
                if (this.delivery_me_distance < this.delivery_teamMate_distance) {
                    return Job.SlaveAgent
                }
                else if (this.delivery_me_distance > this.delivery_teamMate_distance) {
                    return Job.MasterAgent
                }else if (this.delivery_me_distance == this.delivery_teamMate_distance){
                    if (this.me_connection_Time < this.teamMate_connection_Time){
                        return Job.MasterAgent
                    } 
                    else if(this.me_connection_Time > this.teamMate_connection_Time){
                        return Job.SlaveAgent
                    }
                }
            }
        }
        else {
            return Job.SingleAgent
        }

    }

    async getIntention(): Promise<any[]> {
        if (this.myJob == Job.SingleAgent) {
            this.myJob = await this.getJob();
            if (this.myJob != Job.SingleAgent){
                if (this.myJob == Job.SlaveAgent){
                    await this.client.say(this._teamid, JSON.stringify(new MessageType(MessageAction.DELIVER, this.best_fire_point.x, this.best_fire_point.y)));
                }
            }

           
        }

        // Slave has to go to the fire point tile
        if (this.myJob == Job.SlaveAgent) {
            if (this.skip_Slave == false)
                return [this.Plans.MOVE, this.best_fire_point.x, this.best_fire_point.y];

        }

        // Same logic of a Single agent implementation
        if (this.myJob == Job.MasterAgent) {
            if (this.skip_Master == false) { //this is useful in case I want to collaborate with the Slave and I don't want to have intention to do 
                //console.log("enter into the logic", this.skip_Master)
                let carriedQty = this.worldMap.parcels.carriedQty();
                let carriedReward = this.worldMap.parcels.carriedReward();

                // Determine the closest reachable delivery point
                let possibleDeliveries: Coordinates[] = await this.worldMap.nearestDelivery({ x: this.me.x, y: this.me.y });
                let nearestDelivery = null;
                let deliveryLength = Infinity;

                for (const delivery of possibleDeliveries) {
                    const path = await this.worldMap.getPath(this.me as Tile, delivery as Tile);
                    
                    if (path.length != 0 && path.length < deliveryLength) {
                        nearestDelivery = delivery;
                        deliveryLength = path.length;
                    }
                
                }

                if (carriedQty >= this.serverConfig.PARCELS_MAX && carriedQty != 0) {
                    //console.log("deli")
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

                    const meDistance = await this.worldMap.getDistance(
                        { x: this.me.x, y: this.me.y } as Tile,
                        { x: parcel.x, y: parcel.y } as Tile
                    );
                    const exchangeCost = 4;
                    let newParcelReward = carriedReward +
                        parcel.reward -
                        meDistance - exchangeCost -
                        await this.worldMap.getDistance(
                            { x: parcel.x, y: parcel.y } as Tile,
                            nearestDelivery as Tile
                        );

                    if (parcel.carriedBy) {
                        if (parcel.carriedBy == this.id) {
                            //console.log("deli")
                            options.push([this.Plans.DELIVER]);
                            rewards.push(newParcelReward);
                        }
                        continue;
                    }

                    let minDistance: number = Infinity;

                    for (const [agentId, agent] of agents.entries()) {
                        const agentDistance = await this.worldMap.getDistance(
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
                        //console.log("pickup")
                        options.push([this.Plans.PICKUP, parcel.x, parcel.y]);
                        rewards.push(newParcelReward);
                    }
                }

                if (options.length === 0) {
                    //console.log("random")

                    return [this.Plans.RANDOM];
                }

                // Choose the option with the highest reward
                const index = rewards.indexOf(Math.max(...rewards));
                const bestOpt: any[] = options[index];

                // Check if there are parcels on the path to the best option
                if (bestOpt[0] == this.Plans.PICKUP) {
                    let onThePath = [];
                    let pathToSelectedOption = await this.worldMap.getPath(
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
            
        }
    }

    mapIntention(intention: any[]) {
        if (intention[0] === this.Plans.DELIVER) {
            return this.goDeliver();
        } else if (intention[0] === this.Plans.PICKUP) {
            return this.goPickUp({ x: intention[1], y: intention[2] });
        } else if (intention[0] === this.Plans.RANDOM) {
            return this.randomMove();
        } else if (intention[0] === this.Plans.MOVE) {
            return this.targetMove({ x: intention[1], y: intention[2] });
        } 
    }

    private async targetMove(destination: Coordinates): Promise<boolean> {
        let path: Coordinates[] = []
        let wait = 150;

        while (path.length == 0) {
            path = await this.worldMap.getPathPddl(this.me, destination, true);
            await new Promise((res) => setTimeout(res, wait));
        }

        try {
            while (true) {
                if (this.cancelCurrentAction) {
                    return false;
                }

                let result = await this.move(path);
                if (result == true) {
                    return true;
                }

                path = await this.worldMap.getPathPddl(this.me, destination, true);
            }
        } catch (error) {
            return false;
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

            return true;

        } catch (error) {
            return false;
        }
    }

    private async goPickUp(destination: Coordinates): Promise<boolean> {
        
        let path = null

        if (this.myJob == Job.SlaveAgent) {
            console.log(`${Colors.CYAN}Slave Pick up: ${destination.x}, ${destination.y}${Colors.RESET}`)
            path = this.worldMap.search_astar(this.me as Tile, destination as Tile)
        }
        else if (this.myJob == Job.MasterAgent) {
            path = await this.worldMap.getPathPddl(this.me, destination, true);
        }

        try {
            if (this.cancelCurrentAction) {
                return false;
            }
            
            let result = await this.move(path);
            while (result == false) {
                path = await this.worldMap.getPathPddl(this.me as Tile, destination as Tile, true);
                
                result = await this.move(path);
            }

            let res: number[];
            res = await this.client.pickup();
            
            if (res) {
                if (this.myJob == Job.MasterAgent) {
                    await this.client.say(this._teamid, JSON.stringify(new MessageType(MessageAction.PICKED)));
                }
                else if (this.myJob == Job.SlaveAgent) {

                    this.client.say(this._teamid, JSON.stringify(new MessageType(MessageAction.COME, destination.x, destination.y)));

                    // Go deliver
                    let res = await this.goDeliver();
                    
                }

            }

            return true;
        } catch (error) {
            return false;
        }
    }

    private async goDeliver(): Promise<boolean> {
        if (this.myJob == Job.MasterAgent) {
            let destination = this.best_fire_point
            this.skip_Master = true;

            try {
                let path = await this.worldMap.getPathPddl(this.me, destination, true);
                if (path.length == 0) {
                    path = this.worldMap.search_astar(this.me as Tile, destination as Tile);
                }
                if (this.cancelCurrentAction) {
                    return false;
                }
                let result = await this.move(path);
                while (result == false) {
                    path = await this.worldMap.getPathPddl(this.me as Tile, destination as Tile, true);
                    result = await this.move(path);
                }
                let res = null
                if (result) {
                    res = await this.client.putdown();
                    this.currentAction = new Promise<boolean>((resolve) => resolve(true));

                }
                if (res) {
                    
                    for (const dir of this.movement_near_fp) {
                        let result_move = await this.client.move(dir);
                        if (result_move == false) {
                            continue;
                        } else { break }
                        
                    }
                    
                    await this.client.ask(this._teamid, JSON.stringify(new MessageType(MessageAction.PICKUP, destination.x, destination.y)));
                }

                return true;
            } catch (error) {
                return false;
            }
        }


        if (this.myJob == Job.SlaveAgent) {
            let deliveryTiles = await this.worldMap.nearestDelivery(this.me);
            let currentIndex = 0;
            let counter = 0;
            let wait = 150;
            let path: Coordinates[] = []
            let result = false


            try {
                // Added delivery redirect.
               
                while (result == false ) {

                    const deliveryTile = deliveryTiles[currentIndex]
                    console.log(`${Colors.YELLOW}Slave Deliver: ${deliveryTile.x}, ${deliveryTile.y}${Colors.RESET}\n`)

                   
                    path = await this.worldMap.getPathPddl(this.me, deliveryTile, true);

                    if (this.cancelCurrentAction) {
                        return false;
                    }
                    
                    if (path.length != 0){
                        result = await this.move(path);
                        
                    }
                    
                    if (result) {
                        break
                    }

                    if (counter >= 3 && counter < 5) {
                        // 300
                        wait = 300;
                    } else if (counter >= 5 && counter < 7) {
                        // 600
                        wait = 600;
                    } else if (counter >= 7) {
                        console.log(`\x1b[38;5;196mWaited too much! I change plan\x1b[0m`)
                        return false;
                    }


                    console.log(`stucked and wait ${wait}ms`);
                    await new Promise((res) => setTimeout(res, wait));
                    currentIndex = (currentIndex + 1) % deliveryTiles.length;
                    if (currentIndex == deliveryTiles.length - 1) {
                        counter += 1;
                    }
                }

                let res = await this.client.putdown();

                if (res) {

                    let res = await this.targetMove(this.best_fire_point)
                    
                }

                return true;
            } catch (error) {
                return false;
            }

        }

    }

    /**
     * Step function for moving the agent
     * 
     * 
     * 
     * @throws Error `stopped` if the action is externally stopped
     * @param destination Coordinates
     * @returns Promise<boolean> true if the action is successful, false if the action is not successful after 7 tries
     */
    protected async step(destination: Coordinates, last: boolean = false): Promise<boolean> {
        const x = destination.x
        const y = destination.y

        let counter = 0;
        let wait = 50;
        while (this.me.x != x || this.me.y != y) {
            if (this.cancelCurrentAction) throw new Error('stopped');

            let status_x: any = false;
            let status_y: any = false;

            if (x > this.me.x) {
                status_x = await this.client.move(Movements.RIGHT);
            }
            else if (x < this.me.x) {
                status_x = await this.client.move(Movements.LEFT);
            }

            if (status_x) {
                this.me.x = status_x.x;
                this.me.y = status_x.y;
            }

            if (this.cancelCurrentAction) throw new Error('stopped');

            if (y > this.me.y) {
                status_y = await this.client.move(Movements.UP);
            }
            else if (y < this.me.y) {
                status_y = await this.client.move(Movements.DOWN);
            }

            if (status_y) {
                this.me.x = status_y.x;
                this.me.y = status_y.y;
            }

            if (!status_x && !status_y) {
                counter += 1;

                if (counter >= 3 && counter < 5) {
                    wait = 100;
                } else if (counter >= 5 && counter < 7) {
                    wait = 200
                } else if (counter >= 7) {
                    return false;
                }

                if (this.myJob == Job.SlaveAgent && last == true) {
                    let reply = await this.client.ask(
                        this._teamid, 
                        JSON.stringify(new MessageType(MessageAction.WAIT))
                    );
                    
                    await new Promise((res) => setTimeout(res, 200));
                    if (reply == "ok")
                        continue;
                    last = false;
                }

                if (this.myJob == Job.MasterAgent && this.skip_Master == true && last == true) {
                    
                    let reply = await this.client.ask(this._teamid, JSON.stringify(new MessageType(MessageAction.WAIT)));
                   
                    await new Promise((res) => setTimeout(res, 200));
                    if (reply == "ok")
                        continue;
                    last = false;
                }

                console.log(`stucked and wait ${wait}ms`);
                await new Promise((res) => setTimeout(res, wait));
            }
        }
        return true;
    }

    /**
     * Move the agent to the destination given a specific path.
     * 
     * No redirection logic is present here.
     * 
     * @param path Coordinates[]
     * @returns Promise<boolean> true if the action is successful, false if the action is not successful
     */
    protected async move(path: Coordinates[]): Promise<boolean> {
        let last = false;
        let after_element: boolean = false;

        for (const pathElement of path) {
            let agent_tiles: Tile[] = []
            for (const agent of this.worldMap.agents.getAgents()) {
                if (agent[1].id != this._teamid && (agent[1].isVisible == true))
                    agent_tiles.push(agent[1].getLastPosition() as Tile)
            }
            for (const element of path) {
                if (pathElement == element || after_element == true) {
                    for (const a of agent_tiles) {
                        if (a.x == element.x && a.y == element.y) {
                            //console.log("AGENT ON PATH")
                            return false;
                        }
                    }
                    after_element = true
                } else {
                    continue;
                }
            }
            try {
                if (this.cancelCurrentAction) {
                    throw ("stopped");
                }

                if (pathElement == path[path.length - 2]) {
                    last = true;
                    //console.log("last")
                }
                let status = await this.step({ x: pathElement.x, y: pathElement.y }, last);
                if (!status) {
                    return false;
                }

            } catch (error) {
                throw (error);
            }
        }

        return true;
    }

}