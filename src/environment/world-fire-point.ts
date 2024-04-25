import WorldMap from "./world.js";
import { Colors, Coordinates } from "./utils.js";
import Tile from "./tile.js";
import { writeFileSync } from 'fs';


export default class FirePoints {
    private _fireMap: number[][];
    private _firePoint: Map<number, Coordinates[]>;
    private width: number;
    private height: number;

    constructor(worldMap: WorldMap, position: Coordinates, map_name: string) {
        this.width = worldMap.width;
        this.height = worldMap.height;

        this.calculateFirePoints(worldMap);

        // reduce the fireMap to the reachable tiles
        this.reduceFirePoints(worldMap, position);

        // Calculate points of interets (PoI) - aka fire points
        this.normalize();

        
    }

    get fireMap() {
        return this._fireMap;
    }

    get firePoint() {
        return this._firePoint;
    }

    private calculateFirePoints(worldMap: WorldMap) {

        // deliveryTiles
        let fireMap: number[][] = Array.from({ length: worldMap.width }, () => Array(worldMap.height).fill(0));

        // Iterate through the world map to check for parcel spawners and update the fire map
        for (let i = 0; i < worldMap.width; i++) {
            for (let j = 0; j < worldMap.height; j++) {
                let spawnT = worldMap.get(i, j) as Tile;

                if (spawnT.isParcelSpawner) {
                    // Iterate over all delivery tiles and calculate paths
                    worldMap.deliveryTiles.forEach(deliveryT => {
                        let path = worldMap.getPath(spawnT, deliveryT);

                        if (path !== null) {
                            // Update the fire map for each tile in the path
                            path.forEach(tile => {
                                fireMap[tile.x][tile.y] += 1;
                            });
                        }
                    });
                }
            }
        }
        this._fireMap = fireMap;
    }

    private reduceFirePoints(worldMap: WorldMap, position: Coordinates) {
        const agentTile = position as Tile;

        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                const thisTile = worldMap.get(i, j) as Tile;
                const bfsDistance = worldMap.getDistance(agentTile, thisTile);

                if (bfsDistance == Infinity) {
                    this._fireMap[i][j] = 0;
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
                    matrix[i][j] = -10;
                } else {
                    matrix[i][j] = Math.round(this.fireMap[i][j]);
                }
            }
        }

        // Save the matrix as a JSON file
        writeFileSync(`./plots/${map_name}_firemap.json`, JSON.stringify(matrix));
    }

    private normalize() {
        const maxVal = Math.max(...this._fireMap.flat());
        const minVal = Math.min(...this._fireMap.flat());

        let firePoint = new Map<number, Coordinates[]>();

        for (let j = this.height - 1; j >= 0; j--) {
            for (let i = 0; i < this.width; i++) {
                const value = this._fireMap[i][j];

                const normalizedValue = (value - minVal) / (maxVal - minVal);
                const category = Math.min(Math.floor(normalizedValue * 20), 20 - 1);
                if (category == 19) {
                    let coordinatesList = firePoint.get(category) || [];
                    coordinatesList.push({ x: i, y: j });
                    firePoint.set(category, coordinatesList);
                }
            }
        }

        this._firePoint = firePoint;
    }

    public print() {

        const colorIntervals: string[] = [
            "\x1b[38;5;16m",  // Black
            "\x1b[38;5;17m",  // Dark Blue
            "\x1b[38;5;18m",  // Dark Blue 2
            "\x1b[38;5;19m",  // Blue 3
            "\x1b[38;5;20m",  // Blue 4
            "\x1b[38;5;21m",  // Blue 5
            "\x1b[38;5;27m",  // Dark Cyan
            "\x1b[38;5;33m",  // Cyan
            "\x1b[38;5;39m",  // Light Cyan
            "\x1b[38;5;45m",  // Light Cyan 2
            "\x1b[38;5;51m",  // Light Cyan 3
            "\x1b[38;5;82m",  // Green
            "\x1b[38;5;118m", // Light Green
            "\x1b[38;5;154m", // Yellow Green
            "\x1b[38;5;190m", // Light Yellow Green
            "\x1b[38;5;226m", // Yellow
            "\x1b[38;5;220m", // Light Orange
            "\x1b[38;5;214m", // Orange
            "\x1b[38;5;208m", // Dark Orange
            "\x1b[38;5;196m"  // Red
        ];

        const maxVal = Math.max(...this._fireMap.flat());
        const minVal = Math.min(...this._fireMap.flat());

        for (let j = this.height - 1; j >= 0; j--) {
            let rowString = "";

            for (let i = 0; i < this.width; i++) {
                const value = this._fireMap[i][j];

                if (value === 0) {
                    rowString += `${Colors.RESET}□ `;
                    continue;
                }

                const normalizedValue = (value - minVal) / (maxVal - minVal);
                const colorIndex = Math.min(Math.floor(normalizedValue * colorIntervals.length), colorIntervals.length - 1);
                const color = colorIntervals[colorIndex];
                rowString += `${color}■${Colors.RESET} `;
            }

            console.log(rowString);
        }
    }
}