import Tile from "./tile.js";
import { Coordinates } from "./utils.js";
import WorldMap from "./world.js";

/**
 * Tiles path and distances class
 * Path (and distances) are calculated dynamically and cached.
 */
export default class PathCache {
    private tileStaticPaths = new Map<string, Coordinates[] | number>();

    constructor(private worldMap: WorldMap) { }

    private getId(t1: Tile, t2: Tile): string {
        let t1Id = this.worldMap.getId(t1.x, t1.y);
        let t2Id = this.worldMap.getId(t2.x, t2.y);

        if (t1Id > t2Id) {
            return `${t1Id}-${t2Id}`;
        } else {
            return `${t2Id}-${t1Id}`;
        }
    }

    private setPath(t1: Tile, t2: Tile, distanceId: string) {
        if (t1.isWalkable && t2.isWalkable) {
            let t1Id = this.worldMap.getId(t1.x, t1.y);
            let t2Id = this.worldMap.getId(t2.x, t2.y);

            if (t2Id > t1Id) {
                const tmp1 = t1;
                t1 = t2;
                t2 = tmp1;
            }

            // let path = this.worldMap.search_bfs(t1, t2);
            let path = this.worldMap.search_astar(t1, t2);

            if (path == null || path.length == 0) {
                this.tileStaticPaths.set(distanceId, NaN);
                return NaN;
            } else {
                this.tileStaticPaths.set(distanceId, path);
                return path;
            }
        }
        return NaN;
    }

    /**
     * 
     * @param t1 
     * @param t2 
     * @returns number | NaN if the two tiles are not connected together
     */
    public getDistance(t1: Tile, t2: Tile) {
        let distanceId = this.getId(t1, t2);
        let path = this.tileStaticPaths.get(distanceId);

        if (path == undefined) {
            path = this.setPath(t1, t2, distanceId);
        }

        if (Number.isNaN(path)) {
            return Infinity;
        } else if (path == null) {
            throw new Error("PATH IS null OH SHIT");
        } else if (Array.isArray(path)) {
            return path.length - 1;
        } else {
            throw new Error("Unexected path type");
        }
    }

    /**
     * 
     * @param t1 
     * @param t2 
     * @returns Coordinates[] | [] if the two tiles are not connected together
     */
    public getPath(t1: Tile, t2: Tile) {
        // After the creation of the heat-map this should be an hit
        let distanceId = this.getId(t1, t2);
        let path = this.tileStaticPaths.get(distanceId);
        let t1Id = this.worldMap.getId(t1.x, t1.y);
        let t2Id = this.worldMap.getId(t2.x, t2.y);

        if (path == undefined) {
            path = this.setPath(t1, t2, distanceId);
        }

        if (Number.isNaN(path)) {
            return [];
        } else {
            if (t1Id > t2Id) {
                return path as Coordinates[];
            }
            else {
                return [...path as Coordinates[]].reverse();
            }
        }
    }

}