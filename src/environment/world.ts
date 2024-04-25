// For ease of use and to reduce calculations, we can
// have some redundant information
// e.g. globalWorldMap
// e.g. deliveryTiles -> used to search the closest deliveries
// e.g. spawnTiles -> used to go to a random cell
// e.g. walkableTiles -> all cells that exist (and are walkable -> used in bfs)

import { IMap, ITile } from "../deliveroo-api/deliveroo-api.js";
import PathCache from "./world-path-cache.js";
import Tile from "./tile.js";
import { Colors, Coordinates, manhattan_distance, PriorityQueue, CoordinatesWithPriority } from "./utils.js"
import HeatMap from "./world-heat.js";
import FirePoints from "./world-fire-point.js";
import { Agents } from "./agent.js";
import { Parcels } from "./parcel.js";
import { PddlSolver } from "../pddl-api/pddl-api.js";
import { writeFileSync } from 'fs';

export default class WorldMap {
    public readonly width: number;
    public readonly height: number;
    public readonly worldMap = new Map<number, Tile>();
    public readonly deliveryTiles = new Map<number, Tile>();
    public readonly deliveryParcelSpawner = new Map<number, Tile>();

    private _heatMap: HeatMap;
    private _firePoint: FirePoints;

    public agents: Agents;
    public parcels: Parcels;

    private pathCache: PathCache;

    public constructor(
        map: IMap,
        private solver: PddlSolver,
        me: Coordinates,
        id: string,
        parcelsObserationDistance: number,
        map_name: string
    ) {

        this.width = map.width;
        this.height = map.height;

        this.setMap(map.tiles);

        this.pathCache = new PathCache(this);


        console.log("==========WORLD MAP==========");
        this.print();

        this.agents = new Agents();
        this.parcels = new Parcels(id);

        //this.saveMap(this, map_name);
        this._heatMap = new HeatMap(this, parcelsObserationDistance, me, map_name);
        this._firePoint = new FirePoints(this, me, map_name);

        console.log("==========HEAT MAP==========");
        this.heatMap.print();

        console.log("==========FIRE MAP==========");
        this.firePoint.print();

        //process.exit()
    }

    get heatMap() {
        return this._heatMap;
    }

    get firePoint() {
        return this._firePoint
    }

    public getId(x: number, y: number): number {
        return x + 1000 * y;
    }

    private add(tile: Tile): Map<number, Tile> {
        return this.worldMap.set(this.getId(tile.x, tile.y), tile);
    }

    private setMap(tiles: ITile[]): void {
        let tmp_tiles = new Map();

        for (const t of tiles) {
            tmp_tiles.set(this.getId(t.x, t.y), t);
        }

        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                let tile = tmp_tiles.get(this.getId(i, j));

                if (tile == undefined) {
                    this.add(new Tile(i, j));
                } else {
                    this.add(new Tile(i, j, tile.delivery, true, false, tile.parcelSpawner));

                    if (tile.delivery) {
                        this.deliveryTiles.set(this.getId(tile.x, tile.y), tile);
                        // console.log(tile.delivery, this.deliveryTiles)

                    }
                    else if (tile.parcelSpawner) {
                        this.deliveryParcelSpawner.set(this.getId(tile.x, tile.y), tile);
                        //console.log(tile.parcelSpawner,this.deliveryParcelSpawner.set(this.getId(tile.x, tile.y), tile))
                    }

                }
            }
        }
    }

    private saveMap(worldMap: WorldMap, map_name: string) {
        // Save the firemap as a matrix of integers
        let matrix = [];
        for (let i = 0; i < this.width; i++) {
            matrix[i] = [];
            for (let j = 0; j < this.height; j++) {
                let tile = worldMap.get(i, j) as Tile;

                if (!tile.isWalkable) {
                    matrix[i][j] = 0;
                }

                if (tile.isWalkable) {
                    matrix[i][j] = 1;
                }

                if (tile.isParcelSpawner) {
                    matrix[i][j] = 2;
                }

                if (tile.isDelivery) {
                    matrix[i][j] = 3;
                }
            }
            // console.log(matrix[i])
        }

        // Save the matrix as a JSON file
        writeFileSync(`./plots/${map_name}_map.json`, JSON.stringify(matrix));
    }

    public get(x?: number, y?: number): Map<number, Tile> | Tile {
        if (x !== undefined && y !== undefined) {
            return this.worldMap.get(this.getId(x, y));
        } else {
            return this.worldMap;
        }
    }

    public print(x: number = undefined, y: number = undefined): void {
        for (let j = this.height - 1; j >= 0; j--) {
            let rowString = "";

            for (let i = 0; i < this.width; i++) {
                const tile = this.get(i, j) as Tile;

                if (x != undefined && y != undefined && x == i && y == i) {
                    rowString += `${Colors.CYAN}*${Colors.RESET}`;
                } else {
                    if (tile.isAgentPresent == true) {
                        rowString += `${Colors.MAGENTA}A${Colors.RESET} `;
                    } else if (tile.isDelivery == true) {
                        rowString += `${Colors.RED}■${Colors.RESET} `;
                    } else if (tile.isParcelSpawner == true) {
                        rowString += `${Colors.GREEN}■${Colors.RESET} `;
                    } else if (tile.isWalkable == false) {
                        rowString += `${Colors.YELLOW}□${Colors.RESET} `;
                    } else {
                        rowString += `${Colors.DARK_GREEN}■${Colors.RESET} `;
                    }
                }
            }
            console.log(rowString);
        }
    }

    /**
     * Get the path from the initial coordinates to the destination coordinates
     * 
     * This interfaces with the ppdl solver and "transforms everything from async to sync"
     * 
     * @param source Coordinates
     * @param destination Coordinates
     * @returns Promise<Coordinates[]>
    */
    public async getPathPddl(source: Coordinates, destination: Coordinates, considerAgents: boolean = false) {
        if (source.x == destination.x && source.y == destination.y) {
            return [source]
        }

        const domainPDDL = this.createPDDLDomain();
        const problemPDDL = this.createPDDLProblem(source, destination, considerAgents);

        let plan = await this.solver.onlineSolver(domainPDDL, problemPDDL)
       
        if (Number.isNaN(plan)){
            return []
        }

        return plan;
    }


    public search_bfs(t1: Tile, t2: Tile): Coordinates[] {
        // local bfs
        const x1 = t1.x;
        const y1 = t1.y;
        const x2 = t2.x;
        const y2 = t2.y;

        const queue: [number, number][] = [];
        const visited = new Set<string>();
        const parent = new Map<string, [number, number] | null>();
        const directions = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1], // Adjacent cells: left, right, up, down
        ];

        queue.push([x1, y1]);
        visited.add(`${x1},${y1}`);
        parent.set(`${x1},${y1}`, null);

        while (queue.length > 0) {
            const [x, y] = queue.shift()!;

            if (x === x2 && y === y2) {
                // Reconstruct the path
                const path: [number, number][] = [];
                let current: [number, number] | null = [x2, y2];
                while (current !== null) {
                    path.unshift(current);
                    current = parent.get(`${current[0]},${current[1]}`);
                }

                let result: Coordinates[] = []
                path.forEach(element => {
                    result.push({ x: element[0], y: element[1] })
                });

                return result;
            }

            for (const [dx, dy] of directions) {
                const newX = x + dx;
                const newY = y + dy;

                if (
                    newX >= 0 &&
                    newY >= 0 &&
                    newX < this.width &&
                    newY < this.height &&
                    !visited.has(`${newX},${newY}`) &&
                    (this.get(newX, newY) as Tile).isWalkable
                ) {
                    queue.push([newX, newY]);
                    visited.add(`${newX},${newY}`);
                    parent.set(`${newX},${newY}`, [x, y]);
                }
            }
        }

        return []; // No path found
    }


    public search_astar(t1: Tile, t2: Tile): Coordinates[] {
        const x1 = t1.x;
        const y1 = t1.y;
        const x2 = t2.x;
        const y2 = t2.y;

        const openSet = new Set<string>();
        const openHeap = new PriorityQueue<CoordinatesWithPriority>((a, b) => a.priority - b.priority);
        const gScore = new Map<string, number>();
        const fScore = new Map<string, number>();
        const parent = new Map<string, [number, number] | null>();

        const startKey = `${x1},${y1}`;
        const goalKey = `${x2},${y2}`;
        openSet.add(startKey);
        openHeap.push({ x: x1, y: y1, priority: 0 });
        gScore.set(startKey, 0);
        fScore.set(startKey, manhattan_distance(x1, y1, x2, y2));
        parent.set(startKey, null);

        const directions = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ];

        while (openSet.size > 0) {
            const current = openHeap.pop();
            if (!current) break;
            const [x, y] = [current.x, current.y];
            const currentKey = `${x},${y}`;

            if (x === x2 && y === y2) {
                const path = [];
                let cur = [x2, y2];
                while (cur) {
                    path.unshift(cur);
                    cur = parent.get(`${cur[0]},${cur[1]}`);
                }

                let result: Coordinates[] = [];
                path.forEach(element => {
                    result.push({ x: element[0], y: element[1] });
                });

                return result;
            }

            openSet.delete(currentKey);

            for (const [dx, dy] of directions) {
                const newX = x + dx;
                const newY = y + dy;
                const neighborKey = `${newX},${newY}`;

                if (newX >= 0 && newY >= 0 && newX < this.width && newY < this.height) {
                    const neighbor = this.get(newX, newY) as Tile;
                    if (!neighbor.isWalkable || openSet.has(neighborKey)) continue;

                    const tentative_gScore = (gScore.get(currentKey) ?? Infinity) + 1;

                    if (tentative_gScore < (gScore.get(neighborKey) ?? Infinity)) {
                        parent.set(neighborKey, [x, y]);
                        gScore.set(neighborKey, tentative_gScore);
                        fScore.set(neighborKey, tentative_gScore + manhattan_distance(newX, newY, x2, y2));

                        if (!openSet.has(neighborKey)) {
                            openSet.add(neighborKey);
                            openHeap.push({ x: newX, y: newY, priority: fScore.get(neighborKey) ?? Infinity });
                        }
                    }
                }
            }
        }

        return []; // No path found
    }


    public createPDDLDomain(): string {
        return `(define (domain gridworld) 
        (:requirements :strips) 
        (:predicates 
            (at ?x) ; Agent is at cell ?x
            (adjacent ?x ?y) ; Cells ?x and ?y are adjacent
            (walkable ?x) ; Cell ?x is walkable
        ) 
    
        (:action move 
            :parameters (?x ?y) 
            :precondition (and (at ?x) (adjacent ?x ?y) (walkable ?y))
            :effect (and (not (at ?x)) (at ?y))
        ) 
    )
    `
    }

    public createPDDLProblem(initT: Coordinates, goalT: Coordinates, considerAgents: boolean = false): string {

        let objects = new Map<number, string>();
        let tiles: Tile[] = [];
        const walkable: string[] = []
        let agent_tiles: Tile[] = []
        for (const agent of this.agents.getAgents()) {

            if (agent[1].isVisible == true) {
                agent_tiles.push(agent[1].getLastPosition() as Tile)
            }
        }

        this.worldMap.forEach((tile) => {
            objects.set(this.getId(tile.x, tile.y), `TILE_${tile.x}_${tile.y}`)
            tiles.push(tile)

            if (considerAgents == true) {
                for (const a of agent_tiles) {
                    if (a.x == tile.x && a.y == tile.y) {
                        tile.isAgentPresent = true
                        break
                    }
                }
                if (tile.isWalkable && !tile.isAgentPresent) {
                    walkable.push(`(walkable TILE_${tile.x}_${tile.y})\n\t\t`)
                }
            } else {
                if (tile.isWalkable) {
                    walkable.push(`(walkable TILE_${tile.x}_${tile.y})\n\t\t`)
                }
            }

        });

        const adjacentPairs = this.getAdjacentPairs(tiles);

        let problem: string = `(define (problem gridworld-problem) 
            (:domain gridworld)
    
            (:objects 
                ${Array.from(objects.values()).join(' ')}
            )
    
            (:init 
                (at TILE_${initT.x}_${initT.y})
                ; Define adjacent relationships 
                ${adjacentPairs.join(' ')}
                ; Define walkable cells
                ${walkable.join(' ')}
            )
        
            (:goal 
                (at TILE_${goalT.x}_${goalT.y})
            )
        )
    `
        //before return problem i put tile where is the agent to false because I don't know if it moves or not
        this.worldMap.forEach((tile) => {
            for (const a of agent_tiles) {
                if (a.x == tile.x && a.y == tile.y) {
                    tile.isAgentPresent = false;
                    continue;
                }
            }
        });
        return problem;
    }

    private getAdjacentPairs(tiles: Tile[]): string[] {
        const pairs: string[] = [];
        const directions = [
            { dx: 0, dy: 1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: -1 },
            { dx: -1, dy: 0 }
        ];

        tiles.forEach(tile => {
            directions.forEach(dir => {
                const adjacentTile = tiles.find(t => t.x === tile.x + dir.dx && t.y === tile.y + dir.dy);
                if (adjacentTile) {
                    pairs.push(`(adjacent TILE_${tile.x}_${tile.y} TILE_${adjacentTile.x}_${adjacentTile.y})\n\t\t`)
                    pairs.push(`(adjacent TILE_${adjacentTile.x}_${adjacentTile.y} TILE_${tile.x}_${tile.y})\n\t\t`)

                }
            });
        });

        return pairs;
    }

    public getDistance(t1: Tile, t2: Tile) {
        return this.pathCache.getDistance(t1, t2);
    }

    public getPath(t1: Tile, t2: Tile) {
        return this.pathCache.getPath(t1, t2);
    }

    public nearestParcelSpawn(mePosition: Coordinates) {
        const deliveryParcel: Tile[] = [];
        for (const [_, value] of this.deliveryParcelSpawner) {
            deliveryParcel.push(value);
        }
        const tileMe = new Tile(mePosition.x, mePosition.y);

        deliveryParcel.sort((tileA, tileB) => {
            const distanceA = this.getDistance(tileA, tileMe);
            const distanceB = this.getDistance(tileB, tileMe);
            return distanceA - distanceB;
        });

        // Filter out deliveryTiles with NaN distance
        const filteredTiles: Tile[] = deliveryParcel.filter(tile => {
            const distance = this.getDistance(tile, tileMe);
            return !isNaN(distance);
        });

        // Convert filteredTiles from Tile to Coordinates
        const coordinates: Coordinates[] = filteredTiles.map(tile => ({
            x: tile.x,
            y: tile.y
        }));

        return coordinates;
    }

    public nearestDelivery(mePosition: Coordinates) {
        const deliveryTiles: Tile[] = [];

        for (const [_, value] of this.deliveryTiles) {
            deliveryTiles.push(value);
        }

        const tileMe = new Tile(mePosition.x, mePosition.y);

        deliveryTiles.sort((tileA, tileB) => {
            const distanceA = this.getDistance(tileA, tileMe);
            const distanceB = this.getDistance(tileB, tileMe);
            return distanceA - distanceB;
        });

        // Filter out deliveryTiles with NaN distance
        const filteredTiles: Tile[] = deliveryTiles.filter(tile => {
            const distance = this.getDistance(tile, tileMe);
            return !isNaN(distance);
        });

        // Convert filteredTiles from Tile to Coordinates
        const coordinates: Coordinates[] = filteredTiles.map(tile => ({
            x: tile.x,
            y: tile.y
        }));

        return coordinates;
    }

}

