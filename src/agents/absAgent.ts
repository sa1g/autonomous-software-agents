import { DeliverooApi, IConfig, IYou, Movements } from "../deliveroo-api/deliveroo-api.js";
import { Colors, Coordinates, IConfigClient, roundCoordinates } from "../environment/utils.js";
import WorldMap from "../environment/world.js";
import { PddlSolver } from "../pddl-api/pddl-api.js";
import Tile from "../environment/tile.js";

export default abstract class AbsAgent {
    private _id: string;
    private _name: string;
    private _me: Coordinates;
    private _score: number;
    private _serverConfig: IConfigClient;

    protected currentIntention: any[] | null = null;
    protected currentAction: Promise<void | boolean> | null = null;
    protected cancelCurrentAction: boolean = false;

    protected _teamid: string;


    protected readonly Plans = {
        RANDOM: 'random_move',
        PICKUP: 'go_pick_up',
        DELIVER: 'go_deliver',
        MOVE: 'move',
        STAY_FIXED: 'not_move'
    };

    /**
     *  Get agent id
     */
    get id() {
        return this._id;
    }

    /**
     * Get agent name
     */
    get name() {
        return this._name;
    }

    /**
     * Get agent coordinates
     */
    get me() {
        return this._me;
    }

    /**
     * Get agent score - unused variable
     */
    get score() {
        return this._score;
    }

    /**
     * Get server configuration
     */
    get serverConfig() {
        return this._serverConfig;
    }


    /**
     * 
     * @param client DeliverooApi
     * 
     * Initialize the agent with the client
     * Pass worldMap, heatMap, firePoint as arguments
     * 
     * Initialize listeners for the client
     * Start the agent intention plan execution
     */
    constructor(protected client: DeliverooApi, protected solver: PddlSolver, public worldMap: WorldMap) {
        this._id = client.id;
        this._me = client.me;
        this._serverConfig = this.convertClientConfigToServerConfig(client.config);
        //console.log(`${Colors.LIGHT_GREEN}My job: ${this.myJob}${Colors.RESET}`)
        // console.log("I am ", client)
        this.initializeListeners();
    }

    public start() {
        console.log("Starting agent!");
        setInterval(async () => {
            await this.getIntentionPlanExec();
        }, this._serverConfig.CLOCK * 2);
    }

    /**
     * Convert client configuration to server configuration
     * 
     * @param clientConfig IConfig
     * @returns IConfigClient
     */
    private convertClientConfigToServerConfig(clientConfig: IConfig): IConfigClient {
        return {
            ...clientConfig,
            PARCEL_DECADING_INTERVAL: Number(clientConfig.PARCEL_DECADING_INTERVAL.replace('s', '')),
        };
    }

    /**
     * Initialize listeners for the client
     * Listening for:
     * - You
     * - AgentsSensing
     * - ParcelsSensing
     */
    private initializeListeners() {
        this.client.onYou((data: IYou) => {
            let roundMe = roundCoordinates({ x: data.x, y: data.y });
            this._me.x = roundMe.x;
            this._me.y = roundMe.y;
            // console.log(this.me)
            this._score = data.score;
            this._id = data.id;
            this._name = data.name;
        });

        this.client.onAgentsSensing((agents) => {
            this.worldMap.agents.updateAgents(agents);
        });

        this.client.onParcelsSensing((parcels) => {
            this.worldMap.parcels.updateParcels(parcels);
        });

        console.log("Initialization done")
    }


    /**
     * Get the intention plan execution. 
     * 
     * Supports intention revision with complete override.
     * 
     * In short:
     * If the intention is the same as the current intention, check if the current action is finished.
     * If the current action is finished, check if the action was successful or not.
     * If the action was successful, log the action as finished successfully.
     * If the action was not successful, log the action as failed.
     * If the action was stopped, log the action as stopped and failed.
     * If the intention is different from the current intention, cancel the current action and log the new intention.
     * 
     * @returns Promise<void>
     */
    private async getIntentionPlanExec(): Promise<void> {
        const intention = await this.getIntention();

        if(intention == null) { 
            await new Promise((res) => setTimeout(res, 150));
            return;}
        
        if(this.currentIntention != null && this.currentIntention.every((element, index) => JSON.stringify(element) === JSON.stringify(intention[index])) && intention[0] != this.Plans.RANDOM) {
            return;
        }
        let actionStatus: boolean | void;
        if (
            this.currentIntention &&
            this.currentIntention.length === intention.length &&
            this.currentIntention.every((element, index) => JSON.stringify(element) === JSON.stringify(intention[index])) &&
            this.currentAction
        ) {
            actionStatus = await Promise.race([this.currentAction, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 0))]);

            if (!actionStatus) { return; }
        }
        

        this.cancelCurrentAction = true;
        
        const actionResult = await this.currentAction;

        if (actionStatus || actionStatus == undefined) {
            if (actionResult) {
                console.log(`${Colors.GREEN}\tAction ${this.currentIntention} finished successfully.${Colors.RESET}`);
            } else {
                console.log(`${Colors.RED}\tAction ${this.currentIntention} failed.${Colors.RESET}`);
            }
        } else {
            if (actionResult) {
                console.log(`${Colors.GREEN}\tAction ${this.currentIntention} got stopped and finished successfully.${Colors.RESET}`);
            } else {
                console.log(`${Colors.RED}\tAction ${this.currentIntention} got stopped and failed.${Colors.RESET}`);
                console.log(`${Colors.RED}\tCancelling: ${this.currentIntention} >> ${intention}${Colors.RESET}`);
            }
        }
        
        this.cancelCurrentAction = false;

        console.log(`${Colors.GREEN}Starting: ${intention} ${Colors.RESET}`);
        this.currentIntention = intention;

        this.currentAction = this.mapIntention(intention)
        // console.log("finished")

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
    protected async step(destination: Coordinates): Promise<boolean> {
        const x = destination.x
        const y = destination.y

        let counter = 0;
        let wait = 150;
        while (this._me.x != x || this._me.y != y) {
            if (this.cancelCurrentAction) throw new Error('stopped');

            let status_x: any = false;
            let status_y: any = false;

            if (x > this._me.x) {
                status_x = await this.client.move(Movements.RIGHT)
            }
            else if (x < this._me.x) {
                status_x = await this.client.move(Movements.LEFT)
            }

            if (status_x) {
                this._me.x = status_x.x;
                this._me.y = status_x.y;
            }

            if (this.cancelCurrentAction) throw new Error('stopped');

            if (y > this._me.y) {
                status_y = await this.client.move(Movements.UP);
            }
            else if (y < this._me.y) {
                status_y = await this.client.move(Movements.DOWN);
            }

            if (status_y) {
                this._me.x = status_y.x;
                this._me.y = status_y.y;
            }

            if (!status_x && !status_y) {
                counter += 1;

                if (counter >= 3 && counter < 5) {
                    // 300
                    wait = 300;
                } else if (counter >= 5 && counter < 7) {
                    // 600
                    wait = 600
                } else if (counter >= 7) {
                    return false;
                    // throw ["waited too much"];
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

        let after_element: boolean = false;

        for (const pathElement of path) {
            let agent_tiles: Tile[] = []
            for (const agent of this.worldMap.agents.getAgents()) {
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
            // Get the remaining elements in the path
            // cmp if there's an agent on the path

            try {
                if (this.cancelCurrentAction) {
                    throw ("stopped");
                }

                let status = await this.step({ x: pathElement.x, y: pathElement.y });
                if (!status) {
                    return false;
                }

            } catch (error) {
                throw (error);
            }
        }

        return true;
    }



    /**
     * Get the intention of the agent
     * 
     * @returns any[] in the shape of [absAgent.Plans, ...params]
     * 
     * @note remember to update your specfic implementation Plans so that they actually match the plans you are returning
     */
    abstract getIntention();

    /**
     * Map the intention to the specific implementation
     * 
     * @param intention any[]
     * @returns Promise<void | boolean>
     */
    abstract mapIntention(intention: any[]);
}