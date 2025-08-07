import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import { CuuTruyenDto, CuuTruyenDurationDto } from './dto/cuutruyen.dto';

@Injectable()
export class CuuTruyenService implements OnModuleDestroy {
    private readonly logger = new Logger(CuuTruyenService.name);

    constructor(private readonly config: ConfigService) { }

    private browser: puppeteer.Browser | null = null;
    private page: puppeteer.Page | null = null;
    private isInitializing = false;

    private async isPageValid(): Promise<boolean> {
        try {
            return this.page !== null && !this.page.isClosed() && this.browser !== null && this.browser.connected;
        } catch (error) {
            return false;
        }
    }

    private async createNewPage(): Promise<puppeteer.Page> {
        if (!this.browser) {
            throw new Error('Browser not initialized');
        }

        const page = await this.browser.newPage();

        // Set up request interception for performance
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        );

        return page;
    }

    async init(): Promise<void> {
        // Prevent multiple simultaneous initializations
        if (this.isInitializing) {
            // Wait for ongoing initialization
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return;
        }

        const isValid = await this.isPageValid();
        if (isValid) {
            return;
        }

        this.isInitializing = true;

        try {
            // Clean up existing resources
            await this.cleanup();

            // Launch new browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Helps with Docker/CI environments
                    '--disable-web-security', // May help with some API calls
                    '--disable-features=site-per-process'
                ],
            });

            // Create new page
            this.page = await this.createNewPage();

        } finally {
            this.isInitializing = false;
        }
    }

    private async cleanup(): Promise<void> {
        // Close page first
        if (this.page !== null) {
            try {
                if (!this.page.isClosed()) {
                    await this.page.close();
                }
            } catch (err) {
                console.warn('Error closing page:', err.message);
            }
            this.page = null;
        }

        // Then close browser
        if (this.browser !== null) {
            try {
                if (this.browser.connected) {
                    await this.browser.close();
                }
            } catch (err) {
                console.warn('Error closing browser:', err.message);
            }
            this.browser = null;
        }
    }

    private async ensureValidPage(): Promise<void> {
        const isValid = await this.isPageValid();
        if (!isValid) {
            await this.init();
        }
    }

    private async fetchWithHeaders(url: string): Promise<any> {
        try {
            await this.ensureValidPage();

            // Use a fresh page for each request to avoid detached frame issues
            const tempPage = await this.createNewPage();

            try {
                const data = await tempPage.evaluate(async (_url) => {
                    try {
                        const res = await fetch(_url, {
                            method: 'GET',
                            headers: {
                                accept: 'application/json',
                            },
                        });
                        return res.ok ? await res.json() : null;
                    } catch (err) {
                        return { error: err.message };
                    }
                }, url);

                return data;
            } finally {
                // Always close the temporary page
                if (!tempPage.isClosed()) {
                    await tempPage.close();
                }
            }

        } catch (error) {
            console.error('Error in fetchWithHeaders:', error.message);

            // If we get a detached frame error, reinitialize and try once more
            if (error.message.includes('detached Frame') || error.message.includes('Target closed')) {
                console.log('Reinitializing due to detached frame error...');
                await this.cleanup();
                await this.init();

                // Retry once with new page
                const retryPage = await this.createNewPage();
                try {
                    const data = await retryPage.evaluate(async (_url) => {
                        try {
                            const res = await fetch(_url, {
                                method: 'GET',
                                headers: {
                                    accept: 'application/json',
                                },
                            });
                            return res.ok ? await res.json() : null;
                        } catch (err) {
                            return { error: err.message };
                        }
                    }, url);
                    return data;
                } finally {
                    if (!retryPage.isClosed()) {
                        await retryPage.close();
                    }
                }
            }

            throw error;
        }
    }

    async getDataHomePageAsync() {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/home_a`;
        return await this.fetchWithHeaders(url);
    }

    async getMangaByKeywordAsync(keyword: string) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/quick_search?q=${encodeURIComponent(keyword)}`;
        return await this.fetchWithHeaders(url);
    }

    async getMangaInfoAsync(mangaId: number) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/${mangaId}`;
        return await this.fetchWithHeaders(url);
    }

    async getChapterInfoAsync(mangaId: number) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/${mangaId}/chapters`;
        return await this.fetchWithHeaders(url);
    }

    async getChapterPagesAsync(dto: CuuTruyenDto) {
        const apiUrl = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/chapters/${dto.chapter_id}`;
        const dataFromApi = await this.fetchWithHeaders(apiUrl);
        const url = `${this.config.get('CUU_TRUYEN_URL')}/mangas/${dto.manga_id}/chapters/${dto.chapter_id}`;
        const scrapeData = await this.extractBase64Images2(url);

        return {
            source: dataFromApi.data,
            image_datas: scrapeData
        }
    }


    // private async scrapeChapterImages(chapterUrl: string): Promise<string[]> {
    //     const browser = await puppeteer.launch({ headless: true });
    //     const page = await browser.newPage();

    //     await page.evaluateOnNewDocument(() => {
    //         localStorage.setItem('UIPreference3', 'classic');
    //         localStorage.setItem('UIPreferenceConfirmed', 'true');
    //     });

    //     await page.goto(chapterUrl, { waitUntil: 'networkidle2' });
    //     await page.waitForSelector('.relative.w-full.h-auto', { timeout: 60000 });

    //     const listImages = await page.evaluate(async () => {
    //         const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    //         // Trigger loading of all pages
    //         (document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white") as HTMLElement)?.click();
    //         (document.querySelector(".rounded-l-full.button-bare.text-white.h-8.text-xs.uppercase.font-bold.w-28.whitespace-nowrap") as HTMLElement)?.click();

    //         // Scroll to bottom to trigger lazy load
    //         window.scrollTo(0, document.body.scrollHeight);
    //         await delay(3000);

    //         const totalPages = document.querySelectorAll(".relative.w-full.h-auto").length;

    //         // Wait for all images to appear
    //         while (document.querySelectorAll(".w-full.pointer-events-none.w-full").length < totalPages) {
    //             await delay(500);
    //         }

    //         const pageElements = Array.from(document.querySelectorAll(".w-full.pointer-events-none.w-full"));

    //         // Fetch and render all images in parallel
    //         const imagePromises = pageElements.map((pageEl: any) => new Promise<string>(async (resolve) => {
    //             let data: any;
    //             let retries = 3;
    //             let response: Response | null = null;

    //             const imageUrl = pageEl.__vue__?.page?.image_url;
    //             const vueRef = pageEl.__vue__;
    //             while (retries-- > 0) {
    //                 try {
    //                     response = await fetch(imageUrl, {
    //                         cache: "no-store",
    //                         headers: {
    //                             Origin: "https://kakarot.cuutruyen.net",
    //                             "Cache-Control": "no-cache",
    //                             Pragma: "no-cache",
    //                         },
    //                     });
    //                     if (response.ok) break;
    //                 } catch (err) {
    //                     console.error("Fetch error:", err);
    //                     await delay(500);
    //                 }
    //             }

    //             if (!response) return resolve("");

    //             const blob = await response.blob();
    //             const objectURL = URL.createObjectURL(blob);

    //             vueRef.page.image_url = objectURL;
    //             vueRef.image.crossOrigin = "anonymous";

    //             vueRef.image.onload = async () => {
    //                 vueRef.renderCanvas();
    //                 URL.revokeObjectURL(objectURL);

    //                 for (let attempt = 0; attempt < 10; attempt++) {
    //                     await delay(100);
    //                     const base64 = pageEl.toDataURL("image/png");
    //                     if (base64 !== "data:,") {
    //                         return resolve(base64);
    //                     }
    //                 }

    //                 resolve(""); // Fallback if base64 never loads
    //             };

    //             vueRef.image.src = objectURL;
    //         }));

    //         const results = await Promise.all(imagePromises);
    //         return results.filter((img) => img !== ""); // remove failed results
    //     });

    //     await browser.close();
    //     return listImages;
    // }

    // async extractBase64Images(url) {
    //     const browser = await puppeteer.launch({
    //         headless: false, // set to true if you don't need UI
    //         defaultViewport: null
    //     });

    //     const page = await browser.newPage();
    //     await page.evaluateOnNewDocument(() => {
    //         localStorage.setItem('UIPreference3', 'classic');
    //         localStorage.setItem('UIPreferenceConfirmed', 'true');
    //     });
    //     await page.goto(url, {
    //         waitUntil: "networkidle0"
    //     });

    //     const base64List = await page.evaluate(async () => {
    //         const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    //         // Trigger loading
    //         (document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white") as HTMLElement)?.click();
    //         (document.querySelector(".rounded-l-full.button-bare.text-white.h-8.text-xs.uppercase.font-bold.w-28.whitespace-nowrap") as HTMLElement)?.click();

    //         const total = document.querySelectorAll(".relative.w-full.h-auto").length;
    //         const base64List = new Array(total);
    //         let processedCount = 0;

    //         window.scrollTo(0, document.body.scrollHeight);
    //         console.log(`Total ${total} pages`);

    //         while (true) {
    //             const loaded = document.querySelectorAll(".w-full.pointer-events-none.w-full").length;
    //             console.log(`Loaded ${loaded}/${total} pages`);
    //             if (loaded >= total) break;
    //             await delay(1000);
    //         }

    //         const elements = Array.from(document.querySelectorAll(".w-full.pointer-events-none.w-full"));

    //         for (let index = 0; index < elements.length; index++) {
    //             const t = elements[index] as any;

    //             try {
    //                 let response;
    //                 for (let retries = 3; retries > 0; retries--) {
    //                     try {
    //                         console.log(">>> t.__vue__.page.image_url >>>", t.__vue__.page.image_url)
    //                         response = await fetch(t.__vue__.page.image_url, {
    //                             cache: "no-store",
    //                             headers: {
    //                                 Origin: "https://kakarot.cuutruyen.net",
    //                                 "Cache-Control": "no-cache",
    //                                 Pragma: "no-cache"
    //                             }
    //                         });
    //                         console.log(response)
    //                         if (response.ok) break;
    //                     } catch (err) {
    //                         console.error("Fetch error:", err);
    //                     }
    //                 }

    //                 const blob = await response.blob();
    //                 const objectURL = URL.createObjectURL(blob);

    //                 t.__vue__.page.image_url = objectURL;
    //                 t.__vue__.image.src = objectURL;
    //                 t.__vue__.image.crossOrigin = "anonymous";
    //                 t.__vue__.destroyCanvas();

    //                 await new Promise<void>((resolve) => {
    //                     t.__vue__.image.onload = async () => {
    //                         t.__vue__.renderCanvas();
    //                         URL.revokeObjectURL(objectURL);

    //                         while (t.toDataURL("image/png") === "data:,") {
    //                             await delay(100);
    //                         }

    //                         t.toBlob((imgBlob: Blob) => {
    //                             const reader = new FileReader();
    //                             reader.onloadend = () => {
    //                                 base64List[index] = reader.result;
    //                                 processedCount++;
    //                                 console.log(`Processed page ${t.__vue__.page.order} (${processedCount}/${total})`);
    //                                 resolve();
    //                             };
    //                             reader.readAsDataURL(imgBlob);
    //                         });
    //                     };
    //                 });
    //             } catch (err) {
    //                 console.error(`Error processing page ${index + 1}:`, err);
    //             }
    //         }

    //         console.log("✅ All images processed.");
    //         return base64List;
    //     });

    //     await browser.close();

    //     return base64List;
    // }

    // async extractBase64Images2(url) {
    //     this.logger.log(`Extract img from ${url}`)
    //     const browser = await puppeteer.launch({
    //         executablePath: this.config.get<string>('CHROME_PATH'),
    //         headless: true,
    //         defaultViewport: null,
    //         args: [
    //             '--no-sandbox',
    //             '--disable-setuid-sandbox',
    //             '--disable-dev-shm-usage',
    //             '--disable-web-security',
    //             '--disable-features=VizDisplayCompositor',
    //             '--no-first-run'
    //         ]
    //     });

    //     const page = await browser.newPage();

    //     // Prevent page from timing out or being destroyed
    //     await page.setDefaultTimeout(0);
    //     await page.setDefaultNavigationTimeout(0);

    //     await page.evaluateOnNewDocument(() => {
    //         localStorage.setItem('UIPreference3', 'classic');
    //         localStorage.setItem('UIPreferenceConfirmed', 'true');
    //     });

    //     await page.goto(url, {
    //         waitUntil: "networkidle0",
    //         timeout: 0
    //     });

    //     let base64List: any[] = [];

    //     try {
    //         // Split the execution into smaller chunks to prevent context destruction
    //         const setupResult = await page.evaluate(() => {
    //             // Initial setup
    //             ((document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white")) as HTMLElement)?.click();
    //             ((document.querySelector(".rounded-l-full.button-bare.text-white.h-8.text-xs.uppercase.font-bold.w-28.whitespace-nowrap")) as HTMLElement)?.click();

    //             const total = document.querySelectorAll(".relative.w-full.h-auto").length;
    //             window.scrollTo(0, document.body.scrollHeight);

    //             return { total };
    //         });

    //         this.logger.log(`Total ${setupResult.total} pages`);
    //         // Wait for elements to load
    //         let loaded = 0;
    //         while (loaded < setupResult.total) {
    //             await new Promise(resolve => setTimeout(resolve, 1000));

    //             loaded = await page.evaluate(() => {
    //                 return document.querySelectorAll(".w-full.pointer-events-none.w-full").length;
    //             });
    //             this.logger.log(`Loaded ${loaded}/${setupResult.total} pages`);
    //         }

    //         // Process images one by one to avoid context destruction
    //         for (let index = 0; index < setupResult.total; index++) {
    //             try {
    //                 const result: any = await page.evaluate(async (idx) => {
    //                     const delay = (ms) => new Promise(res => setTimeout(res, ms));
    //                     const elements = Array.from(document.querySelectorAll(".w-full.pointer-events-none.w-full"));

    //                     if (idx >= elements.length) {
    //                         return { success: false, error: 'Element not found' };
    //                     }

    //                     const t = elements[idx] as any;

    //                     try {
    //                         let response;
    //                         for (let retries = 3; retries > 0; retries--) {
    //                             try {
    //                                 response = await fetch(t.__vue__.page.image_url, {
    //                                     cache: "no-store",
    //                                     headers: {
    //                                         Origin: "https://kakarot.cuutruyen.net",
    //                                         "Cache-Control": "no-cache",
    //                                         Pragma: "no-cache"
    //                                     }
    //                                 });
    //                                 if (response.ok) break;
    //                             } catch (err) {
    //                                 this.logger.error("Fetch error:", err);
    //                                 if (retries === 1) throw err;
    //                             }
    //                         }

    //                         const blob = await response.blob();
    //                         const objectURL = URL.createObjectURL(blob);

    //                         t.__vue__.page.image_url = objectURL;
    //                         t.__vue__.image.src = objectURL;
    //                         t.__vue__.image.crossOrigin = "anonymous";
    //                         t.__vue__.destroyCanvas();

    //                         return new Promise((resolve) => {
    //                             const timeout = setTimeout(() => {
    //                                 resolve({ success: false, error: 'Timeout' });
    //                             }, 30000); // 30 second timeout per image

    //                             t.__vue__.image.onload = async () => {
    //                                 try {
    //                                     t.__vue__.renderCanvas();
    //                                     URL.revokeObjectURL(objectURL);

    //                                     let attempts = 0;
    //                                     while (t.toDataURL("image/png") === "data:," && attempts < 100) {
    //                                         await delay(100);
    //                                         attempts++;
    //                                     }

    //                                     if (attempts >= 100) {
    //                                         clearTimeout(timeout);
    //                                         resolve({ success: false, error: 'Canvas timeout' });
    //                                         return;
    //                                     }

    //                                     t.toBlob((imgBlob) => {
    //                                         if (!imgBlob) {
    //                                             clearTimeout(timeout);
    //                                             resolve({ success: false, error: 'No blob' });
    //                                             return;
    //                                         }

    //                                         const reader = new FileReader();
    //                                         reader.onloadend = () => {
    //                                             clearTimeout(timeout);
    //                                             resolve({
    //                                                 success: true,
    //                                                 data: reader.result,
    //                                                 pageOrder: t.__vue__.page.order
    //                                             });
    //                                         };
    //                                         reader.onerror = () => {
    //                                             clearTimeout(timeout);
    //                                             resolve({ success: false, error: 'FileReader error' });
    //                                         };
    //                                         reader.readAsDataURL(imgBlob);
    //                                     });
    //                                 } catch (err) {
    //                                     clearTimeout(timeout);
    //                                     resolve({ success: false, error: err.message });
    //                                 }
    //                             };

    //                             t.__vue__.image.onerror = () => {
    //                                 clearTimeout(timeout);
    //                                 resolve({ success: false, error: 'Image load error' });
    //                             };
    //                         });

    //                     } catch (err) {
    //                         return { success: false, error: err.message };
    //                     }
    //                 }, index);

    //                 if (result.success) {
    //                     base64List[index] = result.data;
    //                     this.logger.log(`✅ Processed page ${result.pageOrder} (${index + 1}/${setupResult.total})`);
    //                 } else {
    //                     this.logger.error(`❌ Failed page ${index + 1}:`, result.error);
    //                     base64List[index] = null; // Keep array structure
    //                 }

    //                 // Small delay between processing to prevent overwhelming
    //                 await new Promise(resolve => setTimeout(resolve, 100));

    //             } catch (err) {
    //                 this.logger.error(`Error processing page ${index + 1}:`, err);
    //                 base64List[index] = null;

    //                 // If we get a protocol error, try to recover
    //                 if (err.message.includes('Protocol error') || err.message.includes('Execution context')) {
    //                     this.logger.error('Attempting to recover from context error...');
    //                     await new Promise(resolve => setTimeout(resolve, 2000));
    //                 }
    //             }
    //         }

    //     } catch (err) {
    //         this.logger.error('Fatal error:', err);
    //     } finally {
    //         await browser.close();
    //     }
    //     this.logger.log("✅ All images processed.");
    //     return base64List.filter(item => item !== null);
    // }

    async extractBase64Images2(url) {
        this.logger.log(`Extract img from ${url}`);
        let browser = null as any;
        let page = null as any;
        let base64List: any[] = [];


        try {
            browser = await puppeteer.launch({
                headless: true,
                defaultViewport: null,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--no-first-run',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });

            page = await browser.newPage();

            // Set longer timeouts and prevent page destruction
            await page.setDefaultTimeout(60000); // 60 seconds
            await page.setDefaultNavigationTimeout(60000);

            // Prevent the page from being garbage collected
            await page.evaluateOnNewDocument(() => {
                localStorage.setItem('UIPreference3', 'classic');
                localStorage.setItem('UIPreferenceConfirmed', 'true');

                // Keep page alive
                (window as any).keepAlive = setInterval(() => {
                    console.log('keepAlive');
                }, 30000);
            });

            await page.goto(url, {
                waitUntil: "networkidle0",
                timeout: 60000
            });

            // Split the execution into smaller chunks to prevent context destruction
            const setupResult = await this.safeEvaluate(page, () => {
                // Initial setup
                ((document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white")) as HTMLElement)?.click();
                ((document.querySelector(".rounded-l-full.button-bare.text-white.h-8.text-xs.uppercase.font-bold.w-28.whitespace-nowrap")) as HTMLElement)?.click();

                const total = document.querySelectorAll(".relative.w-full.h-auto").length;
                window.scrollTo(0, document.body.scrollHeight);

                return { total };
            });

            if (!setupResult) {
                throw new Error('Failed to setup page');
            }

            this.logger.log(`Total ${setupResult.total} pages`);

            // Wait for elements to load with better error handling
            let loaded = 0;
            let retryCount = 0;
            const maxRetries = 10;

            while (loaded < setupResult.total && retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000));

                const loadedResult = await this.safeEvaluate(page, () => {
                    return document.querySelectorAll(".w-full.pointer-events-none.w-full").length;
                });

                if (loadedResult !== null) {
                    loaded = loadedResult;
                    this.logger.log(`Loaded ${loaded}/${setupResult.total} pages`);
                    retryCount = 0; // Reset retry count on success
                } else {
                    retryCount++;
                    this.logger.warn(`Failed to get loaded count, retry ${retryCount}/${maxRetries}`);
                }
            }

            if (loaded < setupResult.total) {
                this.logger.warn(`Only loaded ${loaded}/${setupResult.total} pages, proceeding anyway`);
            }

            // Process images with better error recovery
            for (let index = 0; index < Math.min(loaded, setupResult.total); index++) {
                let success = false;
                let attempts = 0;
                const maxAttempts = 3;

                while (!success && attempts < maxAttempts) {
                    try {
                        attempts++;
                        this.logger.log(`Processing page ${index + 1}/${setupResult.total} (attempt ${attempts})`);

                        const result: any = await this.safeEvaluate(page, async (idx) => {
                            const delay = (ms) => new Promise(res => setTimeout(res, ms));
                            const elements = Array.from(document.querySelectorAll(".w-full.pointer-events-none.w-full"));

                            if (idx >= elements.length) {
                                return { success: false, error: 'Element not found' };
                            }

                            const t = elements[idx] as any;

                            try {
                                // Check if Vue instance exists
                                if (!t.__vue__ || !t.__vue__.page || !t.__vue__.page.image_url) {
                                    return { success: false, error: 'Vue instance or image URL not found' };
                                }

                                let response;
                                for (let retries = 3; retries > 0; retries--) {
                                    try {
                                        response = await fetch(t.__vue__.page.image_url, {
                                            cache: "no-store",
                                            headers: {
                                                Origin: "https://kakarot.cuutruyen.net",
                                                "Cache-Control": "no-cache",
                                                Pragma: "no-cache"
                                            }
                                        });
                                        if (response.ok) break;
                                        await delay(1000);
                                    } catch (err) {
                                        console.error("Fetch error:", err);
                                        if (retries === 1) throw err;
                                        await delay(1000);
                                    }
                                }

                                if (!response || !response.ok) {
                                    return { success: false, error: 'Failed to fetch image' };
                                }

                                const blob = await response.blob();
                                const objectURL = URL.createObjectURL(blob);

                                t.__vue__.page.image_url = objectURL;
                                t.__vue__.image.src = objectURL;
                                t.__vue__.image.crossOrigin = "anonymous";

                                if (t.__vue__.destroyCanvas) {
                                    t.__vue__.destroyCanvas();
                                }

                                return new Promise((resolve) => {
                                    const timeout = setTimeout(() => {
                                        URL.revokeObjectURL(objectURL);
                                        resolve({ success: false, error: 'Timeout' });
                                    }, 45000); // 45 second timeout per image

                                    const onLoad = async () => {
                                        try {
                                            if (t.__vue__.renderCanvas) {
                                                t.__vue__.renderCanvas();
                                            }

                                            let attempts = 0;
                                            while (t.toDataURL("image/png") === "data:," && attempts < 50) {
                                                await delay(200);
                                                attempts++;
                                            }

                                            if (attempts >= 50) {
                                                clearTimeout(timeout);
                                                URL.revokeObjectURL(objectURL);
                                                resolve({ success: false, error: 'Canvas render timeout' });
                                                return;
                                            }

                                            t.toBlob((imgBlob) => {
                                                clearTimeout(timeout);
                                                URL.revokeObjectURL(objectURL);

                                                if (!imgBlob) {
                                                    resolve({ success: false, error: 'No blob generated' });
                                                    return;
                                                }

                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    resolve({
                                                        success: true,
                                                        data: reader.result,
                                                        pageOrder: t.__vue__.page.order || idx
                                                    });
                                                };
                                                reader.onerror = () => {
                                                    resolve({ success: false, error: 'FileReader error' });
                                                };
                                                reader.readAsDataURL(imgBlob);
                                            }, "image/png", 0.95);
                                        } catch (err) {
                                            clearTimeout(timeout);
                                            URL.revokeObjectURL(objectURL);
                                            resolve({ success: false, error: err.message });
                                        }
                                    };

                                    const onError = () => {
                                        clearTimeout(timeout);
                                        URL.revokeObjectURL(objectURL);
                                        resolve({ success: false, error: 'Image load error' });
                                    };

                                    t.__vue__.image.onload = onLoad;
                                    t.__vue__.image.onerror = onError;
                                });

                            } catch (err) {
                                return { success: false, error: err.message };
                            }
                        }, index);

                        if (result && result.success) {
                            base64List[index] = result.data;
                            this.logger.log(`✅ Processed page ${result.pageOrder} (${index + 1}/${setupResult.total})`);
                            success = true;
                        } else {
                            const errorMsg = result ? result.error : 'Unknown error';
                            this.logger.error(`❌ Failed page ${index + 1} (attempt ${attempts}):`, errorMsg);

                            if (attempts < maxAttempts) {
                                // Wait before retry
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            } else {
                                base64List[index] = null; // Mark as failed after all attempts
                            }
                        }

                        // Small delay between processing
                        await new Promise(resolve => setTimeout(resolve, 500));

                    } catch (err) {
                        this.logger.error(`Error processing page ${index + 1} (attempt ${attempts}):`, err);

                        // Check if it's a context destruction error
                        if (err.message.includes('Protocol error') ||
                            err.message.includes('Execution context') ||
                            err.message.includes('Cannot find context')) {

                            this.logger.error('Context destroyed, attempting recovery...');

                            // Try to recover by creating a new page
                            try {
                                if (page && !page.isClosed()) {
                                    await page.close();
                                }

                                page = await browser.newPage();
                                await page.setDefaultTimeout(60000);
                                await page.setDefaultNavigationTimeout(60000);

                                await page.evaluateOnNewDocument(() => {
                                    localStorage.setItem('UIPreference3', 'classic');
                                    localStorage.setItem('UIPreferenceConfirmed', 'true');
                                });

                                await page.goto(url, {
                                    waitUntil: "networkidle0",
                                    timeout: 60000
                                });

                                // Re-setup the page
                                await this.safeEvaluate(page, () => {
                                    ((document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white")) as HTMLElement)?.click();
                                    ((document.querySelector(".rounded-l-full.button-bare.text-white.h-8.text-xs.uppercase.font-bold.w-28.whitespace-nowrap")) as HTMLElement)?.click();
                                    window.scrollTo(0, document.body.scrollHeight);
                                });

                                // Wait for page to stabilize
                                await new Promise(resolve => setTimeout(resolve, 3000));

                                this.logger.log('Recovery successful, continuing...');
                            } catch (recoveryErr) {
                                this.logger.error('Recovery failed:', recoveryErr);
                                break; // Exit the processing loop
                            }
                        }

                        if (attempts >= maxAttempts) {
                            base64List[index] = null;
                        }
                    }
                }
            }

        } catch (err) {
            this.logger.error('Fatal error:', err);
            throw err;
        } finally {
            try {
                if (page && !page.isClosed()) {
                    await page.evaluate(() => {
                        if ((window as any).keepAlive) {
                            clearInterval((window as any).keepAlive);
                        }
                    }).catch(() => { }); // Ignore errors when clearing keepAlive
                    await page.close();
                }
                if (browser) {
                    await browser.close();
                }
            } catch (closeErr) {
                this.logger.error('Error closing browser:', closeErr);
            }
        }

        this.logger.log("✅ All images processed.");
        return base64List.filter(item => item !== null);
    }

    // Helper method to safely evaluate code in the page context
    private async safeEvaluate(page: any, func: Function, ...args: any[]): Promise<any> {
        let retries = 3;
        while (retries > 0) {
            try {
                return await page.evaluate(func, ...args);
            } catch (err) {
                retries--;
                if (err.message.includes('Protocol error') ||
                    err.message.includes('Execution context') ||
                    err.message.includes('Cannot find context')) {

                    if (retries > 0) {
                        this.logger.warn(`Context error, retrying... (${retries} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }

                if (retries === 0) {
                    this.logger.error('SafeEvaluate failed after retries:', err);
                    return null;
                }
                throw err;
            }
        }
        return null;
    }


    async getTopMangasDurationAsync(dto: CuuTruyenDurationDto) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/top?duration=${dto.duration_type}&page=${dto.current_page}&per_page=${dto.per_page}`;
        return await this.fetchWithHeaders(url);
    }


    async onModuleDestroy() {
        await this.cleanup();
    }

}
