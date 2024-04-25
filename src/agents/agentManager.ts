import { DeliverooApi, IConfig } from "../deliveroo-api/deliveroo-api.js";
import { IConfigClient } from "../environment/utils.js";
import WorldMap from "../environment/world.js";
import { PddlSolver } from "../pddl-api/pddl-api.js";
import AbsAgent from "./absAgent.js";
import DeliverooAgent from "./basicAgent.js";
import MasterSlaveAgent from "./masterSlaveAgent.js"
import { Job } from "../environment/utils.js";
/**
 * This class manages the creation and execution of a single agent.
 * It is responsible for creating the path cache, worldmap, heatmap and firepoints.
 * It also manages how the map is classified so that the best agent can be selected.
 */
export default class AgentManager {
    agent: AbsAgent;

    public constructor(client: DeliverooApi, solver: PddlSolver, teamid: string = undefined, job: string = Job.SingleAgent) {
        const worldMap = new WorldMap(
            client.map,
            solver,
            client.me,
            client.id,
            this.convertClientConfigToServerConfig(client.config).PARCELS_OBSERVATION_DISTANCE,
            this.convertClientConfigToServerConfig(client.config).MAP_FILE,
        );

        this.defineAgent(client, solver, teamid, worldMap);
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

    private defineAgent(client: DeliverooApi, solver: PddlSolver, teamid: string = undefined, worldMap: WorldMap) {
        if (teamid == undefined) {
            this.agent = new DeliverooAgent(client, solver, worldMap)
        } else  {
            this.agent = new MasterSlaveAgent(client, solver, teamid, worldMap)
        }
    }

    public startAgent() {
        this.agent.start();
    }

}