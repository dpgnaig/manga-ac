import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import { CuuTruyenDto, CuuTruyenDurationDto } from './dto/cuutruyen.dto';
import { ProcessGateway } from 'src/common/process.gateway';
import { StatesService } from '../states/states.service';
import { Semaphore } from 'src/common/semaphore';
import { SavedMangaChapterService } from '../saved-manga-chapter/saved-manga-chapter.service';
import * as fs from "fs";
import * as path from "path";
import pLimit from 'p-limit';
import sharp from 'sharp';

@Injectable()
export class CuuTruyenService implements OnModuleDestroy {
    private readonly logger = new Logger(CuuTruyenService.name);

    constructor(private readonly config: ConfigService,
        private readonly gateway: ProcessGateway,
        private readonly statesService: StatesService,
        private readonly savedMangaChapterService: SavedMangaChapterService) { }

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

                // Force garbage collection
                if (global.gc) {
                    global.gc();
                    this.logger.log('Garbage collection executed');
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

    async getMangaInfoAsync(mangaId: number, userId: string) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/${mangaId}`;
        const data = await this.fetchWithHeaders(url);
        const currentState = await this.statesService.getState(userId, mangaId);
        return {
            ...data,
            state: { ...currentState }
        }
    }

    async getChapterInfoAsync(mangaId: number) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/${mangaId}/chapters`;
        const response1 = await this.fetchWithHeaders(url);
        const response2 = await this.savedMangaChapterService.getDownloadedChaptersGroupedByManga(mangaId);
        if (response2 && response2.chapters.length > 0) {
            const updated = response1.data.map(ch => {
                const mapping = response2.chapters.find(m => m.chapterId === ch.id);
                return {
                    ...ch,
                    process_id: mapping && !mapping.isDownloaded ? `${response2.mangaId}_${mapping?.chapterId ?? ch.id}` : null
                };
            });
            return updated;
        }

        return response1.data;
    }

    async getChapterPagesAsync(dto: CuuTruyenDto, userId: string | null = null) {
        const apiUrl = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/chapters/${dto.chapter_id}`;
        const dataSource = await this.fetchWithHeaders(apiUrl);

        if (dataSource && dataSource.data) {
            this.gateway.sendNotify(dto.process_id, `Bạn đang tải Chương ${dataSource.data.number}: ${dataSource.data.name ?? "Không có tiêu đề"}`);
            const url = `${this.config.get('CUU_TRUYEN_URL')}/mangas/${dto.manga_id}/chapters/${dto.chapter_id}`;

            const scrapedData = await this.scrapeAndSaveImages(url, dto, dataSource.data.number, dataSource.data.pages.length);

            const result = {
                id: dataSource.data.id,
                order: dataSource.data.order,
                number: dataSource.data.number,
                name: dataSource.data.name,
                status: dataSource.data.status,
                previous_chapter_id: dataSource.data.previous_chapter_id,
                previous_chapter_number: dataSource.data.previous_chapter_number,
                previous_chapter_name: dataSource.data.previous_chapter_name,
                next_chapter_id: dataSource.data.next_chapter_id,
                next_chapter_number: dataSource.data.next_chapter_number,
                next_chapter_name: dataSource.data.next_chapter_name,
                manga: { ...dataSource.data.manga },
                total_source_images: dataSource.data.pages.length,
                images: [...scrapedData]
            }

            if (userId) {
                await this.statesService.updateState(userId, dataSource.data.manga.id, dataSource.data.id);
                await this.savedMangaChapterService.upsertSavedMangaChapter(Number(dto.manga_id), [{
                    chapterId: Number(dto.chapter_id),
                    totalImages: result.total_source_images,
                    totalSavedImages: result.images.length,
                }])
            }

            return result;
        } else {
            return null;
        }

    }

    async getTopMangasDurationAsync(dto: CuuTruyenDurationDto) {
        const url = `${this.config.get('CUU_TRUYEN_URL')}/api/v2/mangas/top?duration=${dto.duration_type}&page=${dto.current_page}&per_page=${dto.per_page}`;
        return await this.fetchWithHeaders(url);
    }

    async onModuleDestroy() {
        await this.cleanup();
    }

    // async getDownloadedInfo(folderPath) {
    //     const fs = require('fs');
    //     const path = require('path');
    //     try {
    //         const jsonPath = path.join(folderPath, 'download_summary.json');

    //         // Check if JSON file exists
    //         const jsonExists = await fs.promises
    //             .access(jsonPath, fs.constants.F_OK)
    //             .then(() => true)
    //             .catch(() => false);

    //         if (!jsonExists) {
    //             return [false, null];
    //         }

    //         const summary = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'));
    //         const expectedCount = summary.totalImages;

    //         const entries = await fs.promises.readdir(folderPath);
    //         const webpFiles = entries.filter(entry =>
    //             fs.statSync(path.join(folderPath, entry)).isFile() &&
    //             path.extname(entry).toLowerCase() === '.webp'
    //         );

    //         const actualCount = webpFiles.length;
    //         const isMatched = actualCount === expectedCount;

    //         return [isMatched, isMatched ? summary : null];
    //     } catch (err) {
    //         console.error('Error:', err);
    //         return [false, null];
    //     }
    // }


    async scrapeAndSaveImages(url: string, dto: CuuTruyenDto, chapterNumber: number, totalImages: number) {
        const chapterDir = path.join(process.cwd(), 'images', dto.manga_id.toString(), `${chapterNumber}_${dto.chapter_id.toString()}`);

        // ✅ Check if chapter folder already exists & has files
        if (fs.existsSync(chapterDir) && fs.readdirSync(chapterDir).length > 0) {
            this.gateway.sendStatusWithProgress(dto.process_id, 'Đang kiểm tra truyện đã tải ...', 0);

            const relativePath = `${dto.manga_id}\\${chapterNumber}_${dto.chapter_id}`;
            const files = fs.readdirSync(chapterDir)
                .filter(f => f.endsWith(".webp"))
                .map(f => `${relativePath}\\${f}`);

            if (files.length === totalImages) {
                this.logger.log(`📂 Chapter already downloaded: ${relativePath}`);
                this.gateway.sendStatusWithProgress(dto.process_id, 'Hoàn thành', 100);
                return this.sortByPageNumber(files);
            } else {
                this.gateway.sendStatusWithProgress(dto.process_id, 'Lỗi. Tải lại truyện', 0);
                try {
                    // Check if folder exists first
                    await fs.promises.access(chapterDir, fs.constants.F_OK);

                    // Remove folder recursively
                    await fs.promises.rm(chapterDir, { recursive: true, force: true });

                    this.logger.log(`✅ Removed folder: ${chapterDir}`);
                } catch (err: any) {
                    if (err.code === "ENOENT") {
                        this.logger.warn(`⚠️ Folder not found: ${chapterDir}`);
                    } else {
                        this.logger.error(`❌ Error removing folder ${chapterDir}: ${err}`);
                    }
                }
            }
        }

        // 🔽 Scrape base64 images
        const base64List = await this.scrapeImageToBase64ForLowestCPU(url, dto);

        // 💾 Save images
        const savedPaths = await this.saveBase64Images(base64List, chapterDir, dto, chapterNumber);

        return this.sortByPageNumber(savedPaths); // relative paths only
    }

    async scrapeImageToBase64ForLowestCPU(url: string, dto: CuuTruyenDto) {
        this.logger.log(`Extract img from ${url}`);
        this.gateway.sendStatusWithProgress(dto.process_id, 'Đang khởi tạo quá trình tải truyện...', 0);
        let browser = null as any;
        let page = null as any;
        let base64List: any[] = [];

        try {
            this.gateway.sendStatusWithProgress(dto.process_id, 'Khởi tạo trình duyệt...', 5);
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
                ],
                protocolTimeout: 120000 // 120 seconds
            });

            page = await browser.newPage();
            this.gateway.sendStatusWithProgress(dto.process_id, 'Cấu hình môi trường...', 10);
            await page.setDefaultTimeout(60000);
            await page.setDefaultNavigationTimeout(60000);

            await page.evaluateOnNewDocument(() => {
                localStorage.setItem('UIPreference3', 'classic');
                localStorage.setItem('UIPreferenceConfirmed', 'true');
                (window as any).keepAlive = setInterval(() => {
                    console.log('keepAlive');
                }, 30000);
            });
            this.gateway.sendStatusWithProgress(dto.process_id, 'Đang điều hướng...', 12);
            await page.goto(url, {
                waitUntil: "networkidle0",
                timeout: 60000
            });

            this.gateway.sendStatusWithProgress(dto.process_id, 'Lấy thông tin trang...', 14);

            const setupResult = await this.safeEvaluate(page, () => {
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
            this.gateway.sendStatusWithProgress(dto.process_id, `Tổng số ${setupResult.total} ảnh`, 15);

            let loaded = 0;
            let retryCount = 0;
            let completed = 0;
            const maxRetries = 10;

            while (loaded < setupResult.total && retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000));

                const total = await this.safeEvaluate(page, () => {
                    return document.querySelectorAll(".w-full.pointer-events-none.w-full").length;
                });

                if (total !== null) {
                    loaded = total;
                    this.logger.log(`Loaded ${loaded}/${setupResult.total} pages`);
                    this.gateway.sendStatusWithProgress(dto.process_id, `Tải xong ${loaded}/${setupResult.total} ảnh`, 20);
                    retryCount = 0;
                } else {
                    retryCount++;
                    this.logger.warn(`Failed to get loaded count, retry ${retryCount}/${maxRetries}`);
                }
            }

            if (loaded < setupResult.total) {
                this.logger.warn(`Only loaded ${loaded}/${setupResult.total} pages, proceeding anyway`);
            }

            // -------------------------
            // 🔹 Parallelized processing
            // -------------------------
            const totalPages = Math.min(loaded, setupResult.total);
            const limit = pLimit(5); // limit concurrency to 3 at a time (adjust as needed)

            this.gateway.sendStatusWithProgress(dto.process_id, `Bắt đầu tải ảnh ...`, 25);
            const tasks = Array.from({ length: totalPages }, (_, index) =>
                limit(async () => {
                    let success = false;
                    let attempts = 0;
                    const maxAttempts = 5;

                    while (!success && attempts < maxAttempts) {
                        try {
                            attempts++;
                            this.logger.log(`Processing page ${index + 1}/${setupResult.total} (attempt ${attempts})`);

                            const result: any = await this.safeEvaluate(page, async (idx) => {
                                // === your existing per-page code ===
                                const delay = (ms) => new Promise(res => setTimeout(res, ms));
                                const elements = Array.from(document.querySelectorAll(".w-full.pointer-events-none.w-full"));
                                if (idx >= elements.length) {
                                    return { success: false, error: 'Element not found' };
                                }
                                const t = elements[idx] as any;
                                try {
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
                                        }, 45000);

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
                                                }, "image/webp", 0.85);
                                                // }, "image/png", 0.90);
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
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                } else {
                                    base64List[index] = null;
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } catch (err) {
                            this.logger.error(`Error processing page ${index + 1} (attempt ${attempts}):`, err);
                            if (attempts >= maxAttempts) {
                                base64List[index] = null;
                            }
                        } finally {
                            completed++;
                            // calculate progress %
                            const progress = 25 + Math.floor((completed / totalPages) * 60); // 25–85%
                            this.gateway.sendStatusWithProgress(
                                dto.process_id,
                                `Đang tải trang ${completed}/${totalPages}...`,
                                progress
                            );
                        }
                    }
                })
            );

            await Promise.allSettled(tasks);

            this.gateway.sendStatusWithProgress(dto.process_id, 'Hoàn tất tải ảnh', 85);

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
                    }).catch(() => { });
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




    // async scrapeImageFromCuuTruyen(url: string, dto: CuuTruyenDto, maxConcurrency: number = 3) {
    //     const path = require('path');

    //     const outputDir = path.join(process.cwd(), 'images', dto.manga_id.toString(), dto.chapter_id.toString());

    //     const [isDownloaded, jsonData] = await this.getDownloadedInfo(outputDir);

    //     if (!isDownloaded) {
    //         this.logger.log(`Extract img from ${url} with ${maxConcurrency} parallel workers`);
    //         this.gateway.sendStatusWithProgress(dto.process_id, `Bắt đầu trích xuất ảnh. Vui lòng đợi ...`, 0);

    //         let browser: any = null;
    //         let page: any = null;
    //         let base64List: any[] = [];

    //         try {
    //             browser = await puppeteer.launch({
    //                 headless: true,
    //                 args: [
    //                     '--no-sandbox',
    //                     '--disable-setuid-sandbox',
    //                     '--disable-dev-shm-usage',
    //                     '--disable-web-security',
    //                     '--disable-background-networking',
    //                     '--disable-background-timer-throttling',
    //                     '--disable-renderer-backgrounding',
    //                     '--disable-backgrounding-occluded-windows',
    //                     '--disable-client-side-phishing-detection',
    //                     '--disable-default-apps',
    //                     '--disable-extensions',
    //                     '--disable-sync',
    //                     '--no-first-run',
    //                     // '--memory-pressure-off',
    //                     // '--max_old_space_size=1024', // Limit Node.js heap
    //                     // '--disable-background-media',
    //                     // '--disable-features=TranslateUI',
    //                     // '--disable-ipc-flooding-protection',
    //                     // '--single-process', // Use single process to save memory
    //                     // '--no-zygote'
    //                 ]
    //             });

    //             page = await browser.newPage();
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Khởi tạo môi trường`, 5);
    //             await page.setRequestInterception(true);
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Cấu hình môi trường`, 6);
    //             page.on('request', (req) => {
    //                 const resourceType = req.resourceType();
    //                 if (resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'media') {
    //                     req.abort();
    //                 } else {
    //                     req.continue();
    //                 }
    //             });

    //             this.gateway.sendStatusWithProgress(dto.process_id, `Cấu hình local storage`, 7);

    //             // Set faster timeouts
    //             await page.setDefaultTimeout(60000);
    //             await page.setDefaultNavigationTimeout(90000);

    //             this.gateway.sendStatusWithProgress(dto.process_id, `Cấu hình local storage`, 8);

    //             // Set UI preferences
    //             await page.evaluateOnNewDocument(() => {
    //                 localStorage.setItem('UIPreference3', 'classic');
    //                 localStorage.setItem('UIPreferenceConfirmed', 'true');
    //             });

    //             this.gateway.sendStatusWithProgress(dto.process_id, `Điều hướng ...`, 10);

    //             await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Đã tải trang thành công`, 13);

    //             // Enhanced DOM loading verification
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Đang xác minh DOM đã tải hoàn toàn ...`, 14);
    //             await this.ensureDOMLoaded(page, dto.process_id);

    //             // Setup page and get total count
    //             const setupResult = await this.safeEvaluate(page, () => {
    //                 // Click setup buttons
    //                 (document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white") as HTMLElement)?.click();
    //                 (document.querySelector(".rounded-l-full.button-bare.text-white.h-8.text-xs.uppercase.font-bold.w-28.whitespace-nowrap") as HTMLElement)?.click();

    //                 const total = document.querySelectorAll(".relative.w-full.h-auto").length;
    //                 window.scrollTo(0, document.body.scrollHeight);
    //                 return { total };
    //             });

    //             if (!setupResult) {
    //                 throw new Error('Failed to setup page');
    //             }

    //             this.logger.log(`Total ${setupResult.total} pages`);
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Tổng số ảnh xử lý ${setupResult.total}`, 15);

    //             // Wait for images to load with enhanced verification
    //             let loaded = 0;
    //             let retryCount = 0;
    //             const maxRetries = 8; // Reduced from 10

    //             while (loaded < setupResult.total && retryCount < maxRetries) {
    //                 await new Promise(resolve => setTimeout(resolve, 4000));

    //                 // Verify DOM is still responsive before checking loaded images
    //                 const isDOMResponsive = await this.verifyDOMResponsive(page);
    //                 if (!isDOMResponsive) {
    //                     this.logger.warn('DOM became unresponsive, attempting to recover...');
    //                     await this.ensureDOMLoaded(page, dto.process_id);
    //                 }

    //                 const loadedResult = await this.safeEvaluate(page, () => {
    //                     return document.querySelectorAll(".w-full.pointer-events-none.w-full").length;
    //                 });

    //                 if (loadedResult !== null) {
    //                     loaded = loadedResult;
    //                     const loadingProgress = 15 + Math.round((loaded / setupResult.total) * 25); // 15% to 40% for loading
    //                     this.logger.log(`Loaded ${loaded}/${setupResult.total} pages`);
    //                     this.gateway.sendStatusWithProgress(dto.process_id, `Đã tải được ${loaded}/${setupResult.total} trang`, loadingProgress);
    //                     retryCount = 0;
    //                 } else {
    //                     retryCount++;
    //                     this.logger.warn(`Failed to get loaded count, retry ${retryCount}/${maxRetries}`);
    //                 }
    //             }

    //             const totalToProcess = Math.min(loaded, setupResult.total);
    //             base64List = new Array(totalToProcess).fill(null);

    //             // Final DOM verification before processing images
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Đang xác minh DOM trước khi xử lý ảnh ...`, 39);
    //             await this.ensureDOMLoaded(page, dto.process_id);

    //             // Process images in parallel (40% to 80% progress)
    //             await this.processImagesInParallel(page, totalToProcess, maxConcurrency, base64List, dto.process_id);

    //         } catch (err) {
    //             this.logger.error('Fatal error:', err);
    //             throw err;
    //         } finally {
    //             try {
    //                 if (page && !page.isClosed()) await page.close();
    //                 if (browser) await browser.close();
    //             } catch (closeErr) {
    //                 this.logger.error('Error closing browser:', closeErr);
    //             }
    //         }

    //         this.logger.log("✅ All images processed.");
    //         const validImages = base64List.filter(item => item !== null);
    //         this.gateway.sendStatusWithProgress(dto.process_id, `Đã xử lý xong tất cả ảnh`, 85);

    //         // Save images to local files (85% to 100% progress)
    //         const savedImages = await this.saveImagesToLocal(validImages, url, dto);

    //         this.gateway.sendStatusWithProgress(dto.process_id, `Hoàn thành! Đã xử lý ${savedImages.length}/${base64List.length} ảnh thành công`, 100);

    //         return {
    //             images: savedImages,
    //             total_processed: validImages.length,
    //             total_failed: base64List.length - validImages.length
    //         };
    //     } else {
    //         this.gateway.sendStatusWithProgress(dto.process_id, `Toàn bộ ảnh đã được xử lý`, 100);
    //         return {
    //             images: jsonData.files,
    //             total_processed: jsonData.totalImages,
    //             total_failed: jsonData.failedSaves
    //         };
    //     }
    // }

    // /**
    //  * Enhanced DOM loading verification method
    //  */
    // private async ensureDOMLoaded(page: any, processId?: string): Promise<void> {
    //     const maxAttempts = 10;
    //     let attempts = 0;

    //     while (attempts < maxAttempts) {
    //         try {
    //             // Wait for DOM to be ready
    //             await page.waitForFunction(
    //                 () => document.readyState === 'complete',
    //                 { timeout: 10000 }
    //             );

    //             // Wait for specific elements that indicate the page is fully loaded
    //             await page.waitForSelector('.relative.w-full.h-auto', { timeout: 30000 });

    //             // Verify JavaScript context is working
    //             const isReady = await this.safeEvaluate(page, () => {
    //                 // Check if essential elements exist
    //                 const hasMainElements = document.querySelectorAll('.relative.w-full.h-auto').length > 0;
    //                 const hasButtons = document.querySelector("button.px-6.py-1.text-sm.bg-blue-800.font-bold.text-white") !== null;

    //                 // Check if JavaScript context is responsive
    //                 const jsWorking = typeof document !== 'undefined' &&
    //                     typeof window !== 'undefined' &&
    //                     typeof localStorage !== 'undefined';

    //                 return {
    //                     hasMainElements,
    //                     hasButtons,
    //                     jsWorking,
    //                     readyState: document.readyState,
    //                     timestamp: Date.now()
    //                 };
    //             });

    //             if (isReady && isReady.hasMainElements && isReady.jsWorking) {
    //                 this.logger.log(`✅ DOM fully loaded and verified (attempt ${attempts + 1})`);
    //                 if (processId) {
    //                     this.gateway.sendStatus(processId, `DOM đã được xác minh hoàn toàn`);
    //                 }
    //                 return;
    //             }

    //             this.logger.warn(`DOM not ready yet (attempt ${attempts + 1}):`, isReady);
    //             await new Promise(resolve => setTimeout(resolve, 3000));

    //         } catch (err) {
    //             this.logger.warn(`DOM loading verification failed (attempt ${attempts + 1}):`, err.message);
    //             await new Promise(resolve => setTimeout(resolve, 3000));
    //         }

    //         attempts++;
    //     }

    //     throw new Error(`DOM failed to load properly after ${maxAttempts} attempts`);
    // }

    // /**
    //  * Verify DOM is still responsive during processing
    //  */
    // private async verifyDOMResponsive(page: any): Promise<boolean> {
    //     try {
    //         const result = await this.safeEvaluate(page, () => {
    //             return {
    //                 timestamp: Date.now(),
    //                 readyState: document.readyState,
    //                 hasElements: document.querySelectorAll('.w-full.pointer-events-none.w-full').length > 0
    //             };
    //         });

    //         return result !== null && result.hasElements;
    //     } catch (err) {
    //         this.logger.warn('DOM responsiveness check failed:', err.message);
    //         return false;
    //     }
    // }

    // private async processImagesInParallel(
    //     page: any,
    //     totalImages: number,
    //     maxConcurrency: number,
    //     base64List: any[],
    //     processId: string,
    // ): Promise<void> {
    //     const semaphore = new Semaphore(maxConcurrency);
    //     const promises: Promise<void>[] = [];
    //     let processedCount = 0;

    //     const updateProgress = () => {
    //         const progressPercent = 40 + Math.round((processedCount / totalImages) * 40); // 40% to 80%
    //         this.gateway.sendStatusWithProgress(processId, `Đã xử lý ${processedCount}/${totalImages} ảnh`, progressPercent);
    //     };

    //     for (let index = 0; index < totalImages; index++) {
    //         const promise = semaphore.acquire().then(async (release) => {
    //             try {
    //                 await this.processImageWithRetry(page, index, totalImages, base64List, processId);
    //             } finally {
    //                 processedCount++;
    //                 updateProgress();
    //                 release();
    //             }
    //         });
    //         promises.push(promise);
    //     }

    //     await Promise.allSettled(promises);

    //     const successful = base64List.filter(item => item !== null).length;
    //     const failed = base64List.length - successful;
    //     this.logger.log(`Processing complete: ${successful} successful, ${failed} failed`);
    //     this.gateway.sendStatusWithProgress(processId, `Xử lý hoàn tất: ${successful} thành công, ${failed} thất bại`, 80);
    // }

    // private async processImageWithRetry(
    //     page: any,
    //     index: number,
    //     totalImages: number,
    //     base64List: any[],
    //     processId: string,
    // ): Promise<void> {

    //     const maxAttempts = 3; // Reduced from 3

    //     for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    //         try {
    //             this.logger.log(`Processing page ${index + 1}/${totalImages} (attempt ${attempt})`);
    //             this.gateway.sendStatus(processId, `Đang xử lý trang ${index + 1}/${totalImages} (lần thử ${attempt})`);

    //             // Verify DOM is responsive before processing each image
    //             if (attempt === 1) {
    //                 const isDOMResponsive = await this.verifyDOMResponsive(page);
    //                 if (!isDOMResponsive) {
    //                     this.logger.warn(`DOM not responsive for image ${index + 1}, attempting recovery...`);
    //                     await this.ensureDOMLoaded(page, processId);
    //                 }
    //             }

    //             const result: any = await this.safeEvaluate(page, async (idx) => {
    //                 const delay = (ms) => new Promise(res => setTimeout(res, ms));
    //                 const elements = Array.from(document.querySelectorAll(".w-full.pointer-events-none.w-full"));

    //                 if (idx >= elements.length) {
    //                     return { success: false, error: 'Element not found' };
    //                 }

    //                 const element = elements[idx] as any;

    //                 try {
    //                     if (!element.__vue__?.page?.image_url) {
    //                         return { success: false, error: 'Vue instance or image URL not found' };
    //                     }

    //                     // Fetch image with retry
    //                     let response;
    //                     for (let retries = 5; retries > 0; retries--) { // Reduced from 3
    //                         try {
    //                             response = await fetch(element.__vue__.page.image_url, {
    //                                 cache: "no-store",
    //                                 headers: {
    //                                     Origin: "https://kakarot.cuutruyen.net",
    //                                     "Cache-Control": "no-cache"
    //                                 }
    //                             });
    //                             if (response.ok) break;
    //                             await delay(500); // Reduced delay
    //                         } catch (err) {
    //                             if (retries === 1) throw err;
    //                             await delay(500);
    //                         }
    //                     }

    //                     if (!response?.ok) {
    //                         return { success: false, error: 'Failed to fetch image' };
    //                     }

    //                     const blob = await response.blob();
    //                     const objectURL = URL.createObjectURL(blob);

    //                     element.__vue__.page.image_url = objectURL;
    //                     element.__vue__.image.src = objectURL;
    //                     element.__vue__.image.crossOrigin = "anonymous";

    //                     element.__vue__.destroyCanvas?.();

    //                     return new Promise((resolve) => {
    //                         const timeout = setTimeout(() => {
    //                             URL.revokeObjectURL(objectURL);
    //                             resolve({ success: false, error: 'Timeout' });
    //                         }, 30000); // Reduced from 45000

    //                         const onLoad = async () => {
    //                             try {
    //                                 element.__vue__.renderCanvas?.();

    //                                 // Wait for canvas to render
    //                                 let attempts = 0;
    //                                 while (element.toDataURL("image/png") === "data:," && attempts < 25) { // Reduced from 50
    //                                     await delay(500);
    //                                     attempts++;
    //                                 }

    //                                 if (attempts >= 25) {
    //                                     clearTimeout(timeout);
    //                                     URL.revokeObjectURL(objectURL);
    //                                     resolve({ success: false, error: 'Canvas render timeout' });
    //                                     return;
    //                                 }

    //                                 element.toBlob((imgBlob) => {
    //                                     clearTimeout(timeout);
    //                                     URL.revokeObjectURL(objectURL);

    //                                     if (!imgBlob) {
    //                                         resolve({ success: false, error: 'No blob generated' });
    //                                         return;
    //                                     }

    //                                     const reader = new FileReader();
    //                                     reader.onloadend = () => {
    //                                         resolve({
    //                                             success: true,
    //                                             data: reader.result,
    //                                             pageOrder: element.__vue__.page.order || idx
    //                                         });
    //                                     };
    //                                     reader.onerror = () => {
    //                                         resolve({ success: false, error: 'FileReader error' });
    //                                     };
    //                                     reader.readAsDataURL(imgBlob);
    //                                 }, "image/webp", 0.85);
    //                                 // "image/png", 0.95
    //                             } catch (err) {
    //                                 clearTimeout(timeout);
    //                                 URL.revokeObjectURL(objectURL);
    //                                 resolve({ success: false, error: err.message });
    //                             }
    //                         };

    //                         element.__vue__.image.onload = onLoad;
    //                         element.__vue__.image.onerror = () => {
    //                             clearTimeout(timeout);
    //                             URL.revokeObjectURL(objectURL);
    //                             resolve({ success: false, error: 'Image load error' });
    //                         };
    //                     });

    //                 } catch (err) {
    //                     return { success: false, error: err.message };
    //                 }
    //             }, index);

    //             if (result?.success) {
    //                 base64List[index] = result.data;
    //                 this.logger.log(`✅ Processed page ${result.pageOrder} (${index + 1}/${totalImages})`);
    //                 this.gateway.sendStatus(processId, `Đã xử lý xong ${result.pageOrder} (${index + 1}/${totalImages})`);
    //                 return; // Success, exit retry loop
    //             } else {
    //                 const errorMsg = result?.error || 'Unknown error';
    //                 this.logger.error(`❌ Failed page ${index + 1} (attempt ${attempt}):`, errorMsg);

    //                 if (attempt < maxAttempts) {
    //                     await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
    //                 }
    //             }

    //         } catch (err) {
    //             this.logger.error(`Error processing page ${index + 1} (attempt ${attempt}):`, err);

    //             // Don't retry on context destruction errors
    //             if (err.message.includes('Protocol error') ||
    //                 err.message.includes('Execution context') ||
    //                 err.message.includes('Cannot find context')) {
    //                 this.logger.error(`Context destroyed for page ${index + 1}, marking as failed`);
    //                 break;
    //             }
    //         }
    //     }

    //     // Mark as failed if all attempts exhausted
    //     base64List[index] = null;
    // }

    // private async saveImagesToLocal(
    //     base64Images: string[],
    //     sourceUrl: string,
    //     dto: CuuTruyenDto
    // ): Promise<string[]> {
    //     const fs = require('fs').promises;
    //     const path = require('path');

    //     const outputDir = path.join(process.cwd(), 'images', dto.manga_id.toString(), dto.chapter_id.toString());

    //     await fs.mkdir(outputDir, { recursive: true });
    //     this.logger.log(`Created output directory: ${outputDir}`);
    //     this.gateway.sendStatusWithProgress(dto.process_id, `Tạo thư mục lưu trữ: ${outputDir}`, 85);

    //     const savedImagesName: string[] = [];
    //     let savedCount = 0;

    //     const savePromises = base64Images.map(async (base64Data, index) => {
    //         try {
    //             if (!base64Data || typeof base64Data !== 'string') {
    //                 this.logger.warn(`Skipping invalid image data at index ${index}`);
    //                 return null;
    //             }

    //             const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    //             const imageBuffer = Buffer.from(base64Content, 'base64');
    //             const paddedIndex = String(index + 1).padStart(3, '0');
    //             const filename = `page_${paddedIndex}.webp`;
    //             const filePath = path.join(outputDir, filename);

    //             await fs.writeFile(filePath, imageBuffer);

    //             savedCount++;
    //             const saveProgress = 85 + Math.round((savedCount / base64Images.length) * 15); // 85% to 100%

    //             this.logger.log(`✅ Saved: ${filename} (${Math.round(imageBuffer.length / 1024)}KB)`);
    //             this.gateway.sendStatusWithProgress(dto.process_id, `Đã lưu ${filename} (${savedCount}/${base64Images.length})`, saveProgress);

    //             return filename;

    //         } catch (err) {
    //             this.logger.error(`❌ Failed to save image ${index + 1}:`, err);
    //             return null;
    //         }
    //     });

    //     const results = await Promise.allSettled(savePromises);

    //     results.forEach((result) => {
    //         if (result.status === 'fulfilled' && result.value) {
    //             savedImagesName.push(result.value);
    //         }
    //     });

    //     this.logger.log(`💾 Saved ${savedImagesName.length}/${base64Images.length} images to: ${outputDir}`);
    //     this.gateway.sendStatusWithProgress(dto.process_id, `Lưu thành công ${savedImagesName.length}/${base64Images.length} ảnh`, 100);

    //     // Create summary
    //     await this.createSummaryFile(outputDir, sourceUrl, savedImagesName, base64Images.length);

    //     return savedImagesName;
    // }

    // private async createSummaryFile(
    //     outputDir: string,
    //     sourceUrl: string,
    //     savedFiles: string[],
    //     totalImages: number
    // ): Promise<void> {
    //     const fs = require('fs').promises;
    //     const path = require('path');

    //     const summary = {
    //         sourceUrl,
    //         downloadDate: new Date().toISOString(),
    //         totalImages,
    //         successfulSaves: savedFiles.length,
    //         failedSaves: totalImages - savedFiles.length,
    //         files: savedFiles
    //     };

    //     try {
    //         const summaryPath = path.join(outputDir, 'download_summary.json');
    //         await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    //         this.logger.log(`📋 Created summary file: ${summaryPath}`);
    //     } catch (err) {
    //         this.logger.error('Failed to create summary file:', err);
    //     }
    // }

    private async safeEvaluate(page: any, func: Function, ...args: any[]): Promise<any> {
        const maxRetries = 3; // Reduced from 3

        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                return await page.evaluate(func, ...args);
            } catch (err) {
                if (err.message.includes('Protocol error') ||
                    err.message.includes('Execution context') ||
                    err.message.includes('Cannot find context')) {

                    if (retry < maxRetries - 1) {
                        this.logger.warn(`Context error, retrying... (${maxRetries - retry - 1} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }
                }

                if (retry === maxRetries - 1) {
                    this.logger.error('SafeEvaluate failed after retries:', err);
                    return null;
                }
                throw err;
            }
        }
        return null;
    }



    async saveBase64Images(base64List: string[], outputDir: string, dto: CuuTruyenDto, chapterNumber: number) {
        const savedPaths: string[] = [];

        try {
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const total = base64List.filter(x => !!x).length;
            let completed = 0;

            const limit = pLimit(10);

            const tasks = base64List.map((base64, i) => limit(async () => {
                if (!base64) return;

                const match = base64.match(/^data:image\/webp;base64,(.+)$/);
                if (!match) {
                    this.logger.warn(`Skipping invalid base64 at index ${i}`);
                    return;
                }

                const buffer = Buffer.from(match[1], "base64");
                const fileName = `page_${i + 1}.webp`;
                const filePath = path.join(outputDir, fileName);

                // ✅ Just write the already WebP buffer
                await fs.promises.writeFile(filePath, buffer);

                const relativePath = `${dto.manga_id}\\${chapterNumber}_${dto.chapter_id}\\${fileName}`;
                savedPaths.push(relativePath);

                completed++;
                const progress = 85 + Math.floor((completed / total) * 10);
                this.gateway.sendStatusWithProgress(
                    dto.process_id,
                    `Đang lưu trang ${completed}/${total}...`,
                    progress
                );

                this.logger.log(`💾 Saved: ${relativePath}`);
            }));

            await Promise.all(tasks);

            this.gateway.sendStatusWithProgress(dto.process_id, 'Hoàn thành', 100);
            this.logger.log("✅ All images saved successfully.");
        } catch (err) {
            this.logger.error("Failed saving images:", err);
            throw err;
        }

        return savedPaths;
    }


    private sortByPageNumber(paths: string[]): string[] {
        return paths.sort((a, b) => {
            const numA = parseInt(a.match(/page_(\d+)\.webp/)?.[1] || "0", 10);
            const numB = parseInt(b.match(/page_(\d+)\.webp/)?.[1] || "0", 10);
            return numA - numB;
        });
    }
}