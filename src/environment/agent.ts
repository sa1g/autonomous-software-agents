import { roundCoordinates } from "./utils.js";

// Qst sono gli altri agenti
class Agent {
    public lastModified: number;
    public x: number[] = [];
    public y: number[] = [];
    public parcelScore: number[] = [];
    public isVisible: boolean;

    constructor(
        public id: string,
        public name: string,
        x: number,
        y: number,
        parcelScore: number,
    ) {
        this.isVisible = true
        this.updateProperties(x, y, parcelScore, true);
    }

    private updateProperties(x: number, y: number, parcelScore: number, isVisible: boolean) {
        this.x.push(x);
        this.y.push(y);
        this.parcelScore.push(parcelScore);
        this.lastModified = Date.now();
        this.isVisible = true;
    }

    private refreshProperties(parcelScore, isVisible) {
        this.parcelScore[this.parcelScore.length - 1] = parcelScore;
        this.isVisible = isVisible
    }

    public update(agent: any, isVisible: boolean) {
        const position = roundCoordinates({ x: agent.x, y: agent.y });

        const lastPosition = this.getLastPosition()
        if (position.x == lastPosition.x && position.y == lastPosition.y) {
            this.refreshProperties(agent.score, isVisible);
        } else {
            this.updateProperties(position.x, position.y, agent.score, isVisible);
        }

        // Remove old history beyond 200 iterations
        if (this.x.length > 100) {
            this.x.shift();
            this.y.shift();
            this.parcelScore.shift();
        }
    }

    public getLastPosition() {
        return ({ x: this.x.at(-1), y: this.y.at(-1) })
    }
}

class Agents {
    private agents = new Map<string, Agent>();

    get length(){
        return this.agents.keys.length;
    }

    public updateAgents(agents: { id: string, name: string, x: number, y: number, score: number }[]): void {
        const incomingAgentIds = new Set(agents.map(agent => agent.id));

        // Mark only the agents that are not in the incoming list as not visible
        this.agents.forEach((agent, id) => {
            if (!incomingAgentIds.has(id)) {
                agent.isVisible = false;
            }
        });

        // Add or update agents based on the incoming list
        agents.forEach(agentData => {
            if (agentData.name !== 'god') {
                const existingAgent = this.agents.get(agentData.id);
                if (existingAgent) {
                    // Update the existing agent
                    existingAgent.update(agentData, true);
                } else {
                    // Add the new agent
                    this.agents.set(agentData.id, new Agent(agentData.id, agentData.name, agentData.x, agentData.y, agentData.score));
                }
            }  
        });
    }

    public getAgents(): Map<string, Agent> {
        return this.agents;
    }
}

export { Agent, Agents }