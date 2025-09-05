export class Semaphore {
    private permits: number;
    private waiting: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<() => void> {
        return new Promise((resolve) => {
            if (this.permits > 0) {
                this.permits--;
                resolve(() => this.release());
            } else {
                this.waiting.push(() => {
                    this.permits--;
                    resolve(() => this.release());
                });
            }
        });
    }

    private release(): void {
        this.permits++;
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            if (next) {
                next();
            }
        }
    }
}