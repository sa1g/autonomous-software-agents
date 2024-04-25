type Coordinates = { x: number, y: number }

interface CoordinatesWithPriority extends Coordinates {
    priority: number;
}


enum Strategies {
    SingleAgent= "SingleAgent",
    Collaborative= "Collaborative"
}

enum Job {
    SingleAgent = "Single",
    MasterAgent =  "Master",
    SlaveAgent = "Slave"
};

interface IConfigClient {
    MAP_FILE: string;
    PARCELS_GENERATION_INTERVAL: string;
    PARCELS_MAX: number;
    MOVEMENT_STEPS: number;
    MOVEMENT_DURATION: number;
    AGENTS_OBSERVATION_DISTANCE: number;
    PARCELS_OBSERVATION_DISTANCE: number;
    AGENT_TIMEOUT: number;
    PARCEL_REWARD_AVG: number;
    PARCEL_REWARD_VARIANCE: number;
    PARCEL_DECADING_INTERVAL: number;
    RANDOMLY_MOVING_AGENTS: number;
    RANDOM_AGENT_SPEED: string;
    CLOCK: number;
  }

enum Action {
    LEFT = 'left',
    RIGHT = 'right',
    DOWN = 'down',
    UP = 'up',
    PICKUP = 'pickup',
    PUTDOWN = 'putdown'
}

enum Colors {
    MAGENTA = "\x1b[35m",
    RED = "\x1b[38;5;196m",
    ORANGE = "\x1b[38;5;208m",
    DARK_YELLOW = "\x1b[38;5;214m",
    YELLOW = "\x1b[38;5;220m",
    LIGHT_YELLOW = "\x1b[38;5;226m",
    LIGHT_GREEN = "\x1b[38;5;155m",
    GREEN = "\x1b[38;5;113m",
    DARK_GREEN = "\x1b[38;5;28m",
    CYAN = "\x1b[36m",
    RESET = "\x1b[0m",
};


function roundCoordinates(coords: Coordinates): Coordinates {
    const { x, y } = coords;
    if (Math.round(x * 10) % 10 === 4 || Math.round(y * 10) % 10 === 4) {
        return { x: Math.ceil(x), y: Math.ceil(y) };
    } else if (Math.round(x * 10) % 10 === 6 || Math.round(y * 10) % 10 === 6) {
        return { x: Math.floor(x), y: Math.floor(y) };
    }

    return { x: x, y: y };
}

function manhattan_distance(x1: number, y1: number, x2: number, y2: number ) {
    
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return dx + dy;
}

class PriorityQueue<T> {
    private heap: T[];
    private comparator: (a: T, b: T) => number;

    constructor(comparator: (a: T, b: T) => number) {
        this.heap = [];
        this.comparator = comparator;
    }

    push(item: T) {
        this.heap.push(item);
        this.heapifyUp();
    }

    pop(): T | undefined {
        if (this.size === 0) return undefined;
        const item = this.heap[0];
        const end = this.heap.pop();
        if (this.size > 0 && end) {
            this.heap[0] = end;
            this.heapifyDown();
        }
        return item;
    }

    get size(): number {
        return this.heap.length;
    }

    private heapifyUp() {
        let index = this.heap.length - 1;
        const item = this.heap[index];

        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.heap[parentIndex];

            if (this.comparator(item, parent) >= 0) break;

            this.heap[index] = parent;
            index = parentIndex;
        }

        this.heap[index] = item;
    }

    private heapifyDown() {
        let index = 0;
        const length = this.heap.length;
        const item = this.heap[index];

        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let leftChild, rightChild;
            let swapIndex = null;

            if (leftChildIndex < length) {
                leftChild = this.heap[leftChildIndex];
                if (this.comparator(leftChild, item) < 0) {
                    swapIndex = leftChildIndex;
                }
            }

            if (rightChildIndex < length) {
                rightChild = this.heap[rightChildIndex];
                if (this.comparator(rightChild, swapIndex === null ? item : leftChild!) < 0) {
                    swapIndex = rightChildIndex;
                }
            }

            if (swapIndex === null) break;

            this.heap[index] = this.heap[swapIndex];
            index = swapIndex;
        }

        this.heap[index] = item;
    }
}

export { Action, Colors, roundCoordinates, manhattan_distance, Coordinates, CoordinatesWithPriority, IConfigClient, Job, PriorityQueue, Strategies};