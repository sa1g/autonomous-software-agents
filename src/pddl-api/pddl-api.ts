import fetch from 'node-fetch';
import { Coordinates } from '../environment/utils.js';

enum SupportedPackages {
    LAMA_FIRST = 'lama-first',
    DUAL_BFWS_FFPARSER = 'dual-bfws-ffparser',
    ENHSP_2020 = 'enhsp-2020',
    OPTIC = 'optic',
    DELFI = 'delfi'
}

class PddlSolver {
    private serviceUrl: string;
    private packageName: string;

    constructor(ip: string, port: string, packageName: SupportedPackages) {
        const service = "solve";

        this.packageName = packageName;
        this.serviceUrl = `http://${ip}:${port}/package/${packageName}/${service}`;
    }

    
    public async onlineSolver(pddlDomain: string, pddlProblem: string) {
        const res = await fetch(this.serviceUrl, {
            method: "POST",
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ domain: pddlDomain, problem: pddlProblem })
        });

        if (res.status !== 200) {
            throw new Error(`Error at ${this.serviceUrl} ${await res.text()}`);
        }

        const json: any = await res.json();
        if (!json) {
            throw new Error(`No valid response received from ${this.serviceUrl}`);
        }

        if (json.stderr.includes("FATAL")){
            throw new Error(`Error at ${this.serviceUrl} ${json.stderr}`);
        }


        const plan = this.parsePlan(json);


        const coordinates: Coordinates[] = [];

        plan.forEach(step => {
            // Extract the two tile names from the step
            const match = step.match(/\((MOVE) (TILE_\d+_\d+) (TILE_\d+_\d+)\)/);
            if (match) {
                const [, , fromTile, toTile] = match;

                // Extract coordinates from the tile names
                const toCoords = this.extractCoordinates(toTile);
                coordinates.push(toCoords);
            }
        });

        if (coordinates.length == 0) {
            return [];
        } else {
            return coordinates;
        }
    }



    private parsePlan(json: any) {
        let planText = '';

        switch (this.packageName) {
            case SupportedPackages.LAMA_FIRST:
                if (!json.sas_plan) {
                    break;
                }
                planText = json.sas_plan;
                planText = planText.toUpperCase()
                break;

            case SupportedPackages.DUAL_BFWS_FFPARSER:
            case SupportedPackages.DELFI:
                if (!json.plan) {
                    break;
                }
                planText = json.plan;
                planText = planText.toUpperCase()
                break;

            case SupportedPackages.ENHSP_2020:
                const enhspMatch = json.plan && json.plan.match(/\d+\.\d+: \(.+?\)/g);
                if (!enhspMatch) {
                    break;
                }
                planText = enhspMatch.join('\n').trim();
                planText = planText.toUpperCase()
                break;

            case SupportedPackages.OPTIC:
                const opticMatch = json.plan && json.plan.match(/^\d+\.\d+: \(.+?\)\s+\[\d+\.\d+\]/gm);
                if (!opticMatch) {
                    break;
                }
                planText = opticMatch.join('\n').trim();
                planText = planText.toUpperCase()
                break;

            default:
                throw new Error(`Package ${this.packageName} is not supported for parsing`);
        }

        const planSteps = planText.split('\n').filter((line: string) => line && !line.startsWith(';')).map((line: string) => line.trim());

        switch (this.packageName) {
            case SupportedPackages.OPTIC:
            case SupportedPackages.ENHSP_2020:
                return this.extractContentWithinParentheses(planSteps)
            default:
                return planSteps
        }


    }

    private extractContentWithinParentheses(strings: string[]) {
        return strings.map(step => {
            const match = step.match(/\((.*?)\)/);
            return match ? match[0] : step;
        });
    }

    private extractCoordinates(tile: string): Coordinates {
        const match = tile.match(/TILE_(\d+)_(\d+)/);
        if (match) {
            const [, x, y] = match;
            return { x: parseInt(x, 10), y: parseInt(y, 10) };
        }
        throw new Error(`Invalid tile format: ${tile}`);
    }

}

export { PddlSolver, SupportedPackages }

// import * as fs from 'fs';

// const spackage = SupportedPackages.ENHSP_2020;
// console.log(spackage)
// const solver = new PddlSolver("localhost", "5555", spackage);

// const domainData = fs.readFileSync('domain.pddl', 'utf8');
// const problemData = fs.readFileSync('problem.pddl', 'utf8');

// solver.onlineSolver(domainData, problemData)
//     .then(plan => {
//         console.log("Parsed Plan:");
//         console.log(plan);
//     })
//     .catch((error: Error) => {
//         console.error("Error during planning:", error);
//     });
