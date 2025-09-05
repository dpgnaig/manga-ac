import { Logger } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    transports: ['websocket']
})
export class ProcessGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ProcessGateway.name);

    // Map of socket.id → Set of processIds
    private socketProcessMap = new Map<string, Set<string>>();

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        const processIds = this.socketProcessMap.get(client.id);
        if (processIds) {
            processIds.forEach(processId => {
                client.leave(processId);
                this.logger.log(`Client ${client.id} left process ${processId}`);
            });
            this.socketProcessMap.delete(client.id);
        }
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    /**
     * Client can send either:
     * { processId: string } - single process
     * { processIds: string[] } - multiple processes
     * { processId: string[] } - backward compatible array format
     */
    @SubscribeMessage('joinProcess')
    handleJoinProcess(
        @MessageBody() data: { processId?: string | string[], processIds?: string[] },
        @ConnectedSocket() client: Socket
    ) {
        // Normalize input to array
        let processIds: string[] = [];

        if (data?.processIds && Array.isArray(data.processIds)) {
            processIds = data.processIds;
        } else if (data?.processId) {
            if (Array.isArray(data.processId)) {
                processIds = data.processId;
            } else if (typeof data.processId === 'string') {
                processIds = [data.processId];
            }
        }

        // Validate input
        if (processIds.length === 0 || !processIds.every(id => typeof id === 'string' && id.length > 0)) {
            client.emit('error', { message: 'Invalid processId(s)' });
            return;
        }

        // Get or create the set for this socket
        let socketProcesses = this.socketProcessMap.get(client.id);
        if (!socketProcesses) {
            socketProcesses = new Set<string>();
            this.socketProcessMap.set(client.id, socketProcesses);
        }

        processIds.forEach(processId => {
            client.join(processId);
            socketProcesses.add(processId);
            this.logger.log(`Client ${client.id} joined process ${processId}`);
        });

        // Emit updated list
        this.emitCurrentProcesses(client);
    }

    /**
     * Leave specific processes
     * Client sends: { processIds: string[] }
     */
    @SubscribeMessage('leaveProcess')
    handleLeaveProcess(
        @MessageBody() data: { processIds: string[] },
        @ConnectedSocket() client: Socket
    ) {
        if (!data?.processIds || !Array.isArray(data.processIds)) {
            client.emit('error', { message: 'Invalid processIds array' });
            return;
        }

        const socketProcesses = this.socketProcessMap.get(client.id);
        if (!socketProcesses) {
            return;
        }

        data.processIds.forEach(processId => {
            if (typeof processId === 'string' && socketProcesses.has(processId)) {
                client.leave(processId);
                socketProcesses.delete(processId);
                this.logger.log(`Client ${client.id} left process ${processId}`);
            }
        });

        // Clean up if no processes left
        if (socketProcesses.size === 0) {
            this.socketProcessMap.delete(client.id);
        }

        client.emit('leftProcesses', { processIds: data.processIds });
    }

    /**
     * Get all processes this socket is subscribed to
     */
    @SubscribeMessage('getJoinedProcesses')
    handleGetJoinedProcesses(@ConnectedSocket() client: Socket) {
        const processIds = this.socketProcessMap.get(client.id);
        const processArray = processIds ? Array.from(processIds) : [];
        client.emit('joinedProcesses', { processIds: processArray });
    }

    // Enhanced sending methods that can handle single or multiple process IDs
    sendProgress(processId: string | string[], progress: number) {
        const processIds = Array.isArray(processId) ? processId : [processId];
        processIds.forEach(id => {
            this.server.to(id).emit('progress', { processId: id, progress });
        });
    }

    sendStatus(processId: string | string[], status: string) {
        const processIds = Array.isArray(processId) ? processId : [processId];
        processIds.forEach(id => {
            this.server.to(id).emit('status', { processId: id, status });
        });
    }

    sendNotify(processId: string | string[], notify: string) {
        const processIds = Array.isArray(processId) ? processId : [processId];
        processIds.forEach(id => {
            this.server.to(id).emit('notify', { processId: id, notify });
        });
    }

    sendStatusWithProgress(processId: string | string[], status: string, progress: number) {
        const processIds = Array.isArray(processId) ? processId : [processId];
        processIds.forEach(id => {
            this.server.to(id).emit('statusWithProgress', {
                processId: id,
                status,
                progress
            });
        });
    }

    // Broadcast to multiple processes with different messages
    sendBulkUpdates(updates: Array<{
        processId: string;
        status?: string;
        progress?: number;
        notify?: string;
    }>) {
        updates.forEach(({ processId, status, progress, notify }) => {
            const payload: any = { processId };

            if (status !== undefined) payload.status = status;
            if (progress !== undefined) payload.progress = progress;
            if (notify !== undefined) payload.notify = notify;

            this.server.to(processId).emit('bulkUpdate', payload);
        });
    }

    // Utility method to get all active process IDs
    getAllActiveProcesses(): string[] {
        const allProcesses = new Set<string>();
        this.socketProcessMap.forEach(processSet => {
            processSet.forEach(processId => allProcesses.add(processId));
        });
        return Array.from(allProcesses);
    }

    // Get socket count for a specific process
    getProcessSubscriberCount(processId: string): number {
        return this.server.sockets.adapter.rooms.get(processId)?.size || 0;
    }

    private emitCurrentProcesses(client: Socket) {
        const processes = Array.from(this.socketProcessMap.get(client.id) || []);
        client.emit('joinedProcesses', { processIds: processes });
    }
}