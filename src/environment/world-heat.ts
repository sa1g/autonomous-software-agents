import Tile from "./tile.js"
import WorldMap from "./world.js"
import { Colors, Coordinates } from "./utils.js";
import { writeFileSync } from 'fs';

/**
 *  1. NEARBY GUARDIANS: for each walkable cell, we see how many spawn cells
 *     there are with a long direct connection
 *     BFS <= manhattan distance <= parcelObsDistance
 *     If parcelObsDistance = inf, we cap it at 10.
 *     The score is calculated with multipliers:
 *     a spawner cell is worth parcelObsDistance+1 points, we subtract the
 *     distance (BFS and manhattan at this point are the same).
 *     the total score is given by the values we give to the spawner cells we see.
 */

export default class HeatMap {
    private heatMap: number[][];
    private width: number;
    private height: number;

    constructor(worldMap: WorldMap, parcelObsDistance: number, position: Coordinates, map_name: string) {
        this.width = worldMap.width;
        this.height = worldMap.height;

        if (parcelObsDistance == Infinity) {
            parcelObsDistance = 10;
        }

        this.createHeatMap(worldMap, parcelObsDistance)
        this.reduceHeatMap(worldMap, position)
    }

    private createHeatMap(worldMap: WorldMap, parcelObsDistance: number): void {
        let result: number[][] = [];
    
        for (let i = 0; i < this.width; i++) {
            result[i] = [];
            for (let j = 0; j < this.height; j++) {
                result[i][j] = 0;
                let thisTile = worldMap.get(i, j) as Tile;
    
                if (thisTile.isWalkable) {
                    for (let k = 0; k < this.width; k++) {
                        for (let l = 0; l < this.height; l++) {
                            let otherTile = worldMap.get(k, l) as Tile;
    
                            if (otherTile.isWalkable) {
                                // Fetch distance synchronously
                                let bfsDistance = worldMap.getDistance(thisTile, otherTile); // Assuming a synchronous version exists
                                if (!Number.isNaN(bfsDistance) && bfsDistance <= parcelObsDistance && otherTile.isParcelSpawner) {
                                    result[i][j] += parcelObsDistance - bfsDistance;
                                }
                            }
                        }
                    }
                }
            }
        }
    
        this.heatMap = result;
    }

    private reduceHeatMap(worldMap: WorldMap, position: Coordinates) {
        const agentTile = position as Tile;

        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                const thisTile = worldMap.get(i, j) as Tile;
                const bfsDistance = worldMap.getDistance(agentTile, thisTile);

                if (bfsDistance == Infinity) {
                    this.heatMap[i][j] = 0;
                }
            }
        }
    }

    private saveMap(worldMap: WorldMap, map_name: string) {
        console.log("Saving heatmap... ", map_name)
        // Save the firemap as a matrix of integers
        let matrix = [];
        for (let i = 0; i < this.width; i++) {
            matrix[i] = [];
            for (let j = 0; j < this.height; j++) {
                let tile = worldMap.get(i, j) as Tile;
                if (!tile.isWalkable) {
                    matrix[i][j] = -10;
                } else {
                    matrix[i][j] = Math.round(this.heatMap[i][j]);
                }
            }
        }

        // Save the matrix as a JSON file
        writeFileSync(`./plots/${map_name}_heatmap.json`, JSON.stringify(matrix));
    }


    public print() {
        const colorIntervals = [
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

        const maxVal = Math.max(...this.heatMap.flat());
        const minVal = Math.min(...this.heatMap.flat());

        for (let j = this.height - 1; j >= 0; j--) {
            let rowString = "";

            for (let i = 0; i < this.width; i++) {
                const value = this.heatMap[i][j];

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

    public getRandomPosition(): Coordinates | null {
        // Flatten the matrix and filter out zeros
        let positions: { value: number, coordinates: Coordinates }[] = [];
        for (let x = 0; x < this.heatMap.length; x++) {
            for (let y = 0; y < this.heatMap[x].length; y++) {
                if (this.heatMap[x][y] > 0) {
                    positions.push({ value: this.heatMap[x][y], coordinates: { x, y } });
                }
            }
        }

        // Check if there are any valid positions
        if (positions.length === 0) {
            return null;
        }

        // Compute the cumulative sum
        let totalSum = positions.reduce((sum, position) => sum + position.value, 0);
        let cumulativeSum = 0;
        let cumulativeDistribution: { cumSum: number, coordinates: Coordinates }[] = [];
        for (let position of positions) {
            cumulativeSum += position.value;
            cumulativeDistribution.push({ cumSum: cumulativeSum, coordinates: position.coordinates });
        }

        // Generate a random number between 0 and totalSum
        let randomValue = Math.random() * totalSum;

        // Find the position corresponding to the random value
        for (let entry of cumulativeDistribution) {
            if (randomValue < entry.cumSum) {
                return entry.coordinates;
            }
        }

        // Fallback in case of an unexpected issue (shouldn't normally happen)
        return cumulativeDistribution[cumulativeDistribution.length - 1].coordinates;
    }

}