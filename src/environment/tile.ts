class Tile {

    constructor(
        public x: number,
        public y: number,
        public isDelivery: boolean = false,
        public isWalkable: boolean = false,
        public isAgentPresent: boolean = false,
        public isParcelSpawner: boolean = false
    ) { }
}

export default Tile;