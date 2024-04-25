import { DeliverooApi } from "./src/deliveroo-api/deliveroo-api.js"
import { PddlSolver, SupportedPackages } from "./src/pddl-api/pddl-api.js";
import AgentManager from "./src/agents/agentManager.js";


const client = await DeliverooApi.create({
    host: 'http://localhost:8080/?name=CAPTCHA',
    token: '<TOKEN>>'
    
});

const solver = new PddlSolver("localhost", "5555", SupportedPackages.LAMA_FIRST);
let myAgent = new AgentManager(client, solver);
myAgent.startAgent();
