import { Socket, io } from "socket.io-client";
import argsParser from "args-parser";
import { Coordinates } from "../environment/utils.js";

// Define the argument parsing
const args = argsParser(process.argv);
let NAME = args['name'];
let TOKEN = args['token'];
let HOST = args['host'];

// Define the Tile, Map, and other interfaces
interface IDeliverooApiOptions {
  host: string;
  token?: string;
}

interface ITile {
  x: number;
  y: number;
  delivery: boolean;
  parcelSpawner: boolean;
}

interface IMap {
  width: number;
  height: number;
  tiles: ITile[];
}

interface IConfig {
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
  PARCEL_DECADING_INTERVAL: string;
  RANDOMLY_MOVING_AGENTS: number;
  RANDOM_AGENT_SPEED: string;
  CLOCK: number;
}

interface IYou {
  id: string;
  name: string;
  x: number;
  y: number;
  score: number;
}

interface IAgentSensing {
  id: string;
  name: string;
  x: number;
  y: number;
  score: number;
}

interface IParcelSensing {
  id: string;
  x: number;
  y: number;
  carriedBy: string;
  reward: number;
}

type LogCallback = (info: { src: 'server' | 'client'; timestamp: number; socket: string; id: string; name: string }, ...message: any[]) => void;
type OnMsgCallback = (id: string, name: string, msg: any, replyAcknowledgmentCallback: (response: string) => void) => void;
type MoveResponse = { x: number; y: number } | false;

enum Movements {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right'
}

class DeliverooApi {
  private socket: Socket;
  token: string;
  id: string;
  name: string;
  config: IConfig;
  map: IMap;
  me: Coordinates = { x: undefined, y: undefined };

  private constructor(socket: Socket, token: string) {
    this.socket = socket;
    this.token = token;
  }

  static async create(options: IDeliverooApiOptions): Promise<DeliverooApi> {
    const { host, token } = options;
    let opts: any = {};

    if (NAME) {
      opts.query = { name: NAME };
    } else {
      opts.extraHeaders = { 'x-token': TOKEN || token };
    }

    const socket = io(HOST || host, opts);

    const api = new DeliverooApi(socket, TOKEN || token);

    await api.initialize();

    return api;
  }

  private async initialize(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.token === '') {
      promises.push(new Promise<void>((resolve) => {
        this.socket.once('token', (token) => {
          this.token = token;
          console.log('New token for ' + NAME + ': ' + token);
          resolve();
        });
      }));
    }

    promises.push(
      new Promise<void>((resolve) => {
        this.socket.once('you', (data: IYou) => {
          this.id = data.id;
          this.name = data.name;
          this.me.x = data.x;
          this.me.y = data.y;
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        this.socket.once('config', (config) => {
          this.config = config;
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        this.socket.once('map', (width, height, tiles) => {
          this.map = { width, height, tiles };
          resolve();
        });
      }),

    );

    await Promise.all(promises);

    console.log('All socket events are initialized');
  }

  public onConnect(callback: () => void): void {
    this.socket.on("connect", callback);
  }

  public onDisconnect(callback: () => void): void {
    this.socket.on("disconnect", callback);
  }

  public onTile(callback: (x: number, y: number, delivery: any) => void): void {
    this.socket.on("tile", callback);
  }

  public onNotTile(callback: (x: number, y: number) => void): void {
    this.socket.on("not_tile", callback);
  }

  public onMap(callback: (width: number, height: number, tiles: ITile[]) => void): void {
    this.socket.on("map", callback);
  }

  public onYou(callback: (data: IYou) => void): void {
    this.socket.on("you", callback);
  }

  public onAgentsSensing(callback: (data: IAgentSensing[]) => void): void {
    this.socket.on("agents sensing", callback);
  }

  public onParcelsSensing(callback: (data: IParcelSensing[]) => void): void {
    this.socket.on("parcels sensing", callback);
  }

  public onMsg(callback: OnMsgCallback): void {
    this.socket.on("msg", callback);
  }

  public onLog(callback: LogCallback): void {
    this.socket.on("log", callback);
  }

  public onConfig(callback: (config: IConfig) => void): void {
    this.socket.on("config", callback);
  }


  public async move(direction: Movements): Promise<MoveResponse> {
    return new Promise((success) => {
      this.socket.emit('move', direction, (status: MoveResponse) => {
        success(status);
      });
    });
  }

  public async pickup(): Promise<number[]> {
    return new Promise((success) => {
      this.socket.emit('pickup', (picked: number[]) => {
        success(picked);
      });
    });
  }

  public async putdown(selected: string[] = null): Promise<number[]> {
    return new Promise((success) => {
      this.socket.emit('putdown', selected, (dropped: number[]) => {
        success(dropped);
      });
    });
  }

  public async say(toId: string, msg: string): Promise<boolean> {
    return new Promise((success) => {
      this.socket.emit('say', toId, msg, (status: boolean) => {
        success(status);
      });
    });
  }

  public async ask(toId: string, msg: string): Promise<string> {
    return new Promise((success) => {
      this.socket.emit('ask', toId, msg, (reply: string) => {
        success(reply);
      });
    });
  }

  public async shout(msg: string): Promise<boolean> {
    return new Promise((success) => {
      this.socket.emit('shout', msg, (status: boolean) => {
        success(status);
      });
    });
  }
}

export { DeliverooApi, ITile, IMap, IConfig, IYou, IAgentSensing, IParcelSensing, LogCallback, OnMsgCallback, MoveResponse, Movements };
