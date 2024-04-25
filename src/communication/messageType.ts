enum MessageAction {
    PICKED = 'picked',
    DELIVER = 'deliver',
    WAIT = 'wait',
    ARRIVED = 'arrived',
    COME = 'come',
    BLOCK = 'block',
    PICKUP = 'pickup',
    FIRE_POINT_DISTANCE = 'fp_dist',
    CONNECT = 'connect'
}

class MessageType{
    public readonly action : MessageAction
    public readonly x: number
    public readonly y: number
    public readonly Time: number

    constructor (action: MessageAction, x: number = undefined, y: number = undefined, Time : number = undefined){
        this.action = action;
        this.x = x;
        this.y = y;
        this.Time = Time;
    }
}
export {MessageAction, MessageType};