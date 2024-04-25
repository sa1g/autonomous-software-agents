import { IParcelSensing } from "../deliveroo-api/deliveroo-api.js";
import { roundCoordinates } from "./utils.js";

class Parcel {
    constructor(
        public id: string,
        public x: number,
        public y: number,
        public reward: number,
        public carriedBy: string,
    ) { }

    private updateProperties(x: number, y: number, reward: number, carriedBy: string) {
        this.x = x;
        this.y = y;
        this.reward = reward;
        this.carriedBy = carriedBy;
    }

    public update(parcel: any) {
        const position = roundCoordinates({ x: parcel.x, y: parcel.y });
        this.updateProperties(position.x, position.y, parcel.reward, parcel.carriedBy);
    }
}

class Parcels {
    public readonly parcels = new Map<string, Parcel>();
    private carried = new Map<string, string>();

    constructor(private id: string) { }

    updateParcels(parcels: (Parcel | IParcelSensing)[]) {

        for (const parcel of parcels) {
            let { x, y } = roundCoordinates({ x: parcel.x, y: parcel.y });
            parcel.x = x;
            parcel.y = y;
            
            const thisParcel = new Parcel(parcel.id, parcel.x, parcel.y, parcel.reward, parcel.carriedBy);

            if (!this.parcels.has(thisParcel.id)) {
                this.parcels.set(thisParcel.id, thisParcel);
            } else {
                this.parcels.get(thisParcel.id)?.update(parcel);
            }

            if (parcel.carriedBy === this.id) {
                if (!this.carried.has(parcel.id)) {
                    this.carried.set(parcel.id, parcel.id);
                }
            }
        }

        for (const id of Array.from(this.parcels.keys())) {
            if (!parcels.find((p) => p.id === id)) {
                this.parcels.delete(id);
                this.carried.delete(id);
            }
        }
    }

    public getParcels(): Map<string, Parcel> {
        return this.parcels;
    }

    public getCarried(): Map<string, string> {
        return this.carried;
    }

    public carriedQty(): number {
        return this.carried.size;
    }

    public carriedReward(): number {
        let sum = 0;

        for (const parcelId of this.carried.keys()) {
            const parcel = this.parcels.get(parcelId);
            if (parcel) {
                sum += parcel.reward;
            }
        }

        return sum;
    }
}

export { Parcel, Parcels };