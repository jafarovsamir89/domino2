import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import RedisImport from "ioredis";

const Redis = RedisImport as any;

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: any;

  async connectToRedis(redisUrl: string): Promise<void> {
    const pubClient = new Redis(redisUrl, {
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        return Math.min(times * 200, 1000);
      }
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
