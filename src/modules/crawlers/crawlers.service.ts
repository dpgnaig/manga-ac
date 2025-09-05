import { Inject, Injectable, Scope } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ChapterImageResponse, ChapterInfoResponse, MangaInfoResponse, RequestChapterDto, RequestChapterImageDto } from './dto/chapterInfo.dto';
import { HeaderManager } from 'src/utils/header-manager';

const MangaConstants = {
    CHAPTER_URL_FORMAT: 'truyen-tranh/{0}',
};

export class CrawlersService {
    constructor() { }

    public async getChapterNodesAsync(request: RequestChapterDto): Promise<ChapterInfoResponse[]> {
        const chapterInfos: ChapterInfoResponse[] = [];
        try {
            const headers = {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            };

            const apiUrl = `${request.baseUrl}/${MangaConstants.CHAPTER_URL_FORMAT.replace('{0}', request.mangaSlug)}`;

            const response = await axios.get(apiUrl, { headers });
            console.log(`Response received from ${apiUrl}`);

            const $ = cheerio.load(response.data);

            const chapterItems = $('.works-chapter-item');

            if (chapterItems.length > 0) {
                chapterItems.each((_, element) => {
                    const linkNode = $(element).find('.name-chap a');
                    const timeNode = $(element).find('.time-chap');

                    const href = linkNode.attr('href')?.trim().substring(1) || '';
                    const name = linkNode.text().trim();
                    const updatedAt = timeNode.text().trim();

                    const match = name.match(/\s*\d+(?:\.\d+)?/);
                    const chapterNum = match ? parseFloat(match[0]) : 0;

                    chapterInfos.push({
                        href,
                        name,
                        chapterNum,
                        updatedAt,
                    });
                });
            } else {
                console.log('No chapter items found.');
            }

            chapterInfos.sort((a, b) => a.chapterNum - b.chapterNum);
            return chapterInfos;
        } catch (error) {
            console.error('Error getting chapters from API:', error);
            throw error;
        }
    }

    public async extractImageUrlsAsync(request: RequestChapterImageDto): Promise<ChapterImageResponse[]> {
        const base64Images: ChapterImageResponse[] = [];

        const chapterUrl = `${request.baseUrl}/${request.href}`
        try {
            // Headers configuration
            const headers = HeaderManager.getImageHeaders(chapterUrl); // replicate your logic
            const response = await axios.get(chapterUrl, { headers });

            // Load HTML with cheerio
            const $ = cheerio.load(response.data);

            // Find image nodes under .page-chapter
            const imgElements = $('div.page-chapter img');
            const imageUrls: string[] = [];
            imgElements.each((_, img) => {
                const src = $(img).attr('data-src') || $(img).attr('src');
                if (src && this.isValidUrl(src) && !imageUrls.includes(src)) {
                    imageUrls.push(src);
                }
            });


            for (const url of imageUrls) {
                try {
                    const response = await axios.get(url, { headers, responseType: 'arraybuffer' });
                    const base64 = Buffer.from(response.data).toString('base64');
                    const contentType = response.headers['content-type'] || 'image/jpeg';
                    base64Images.push({
                        url: url,
                        base64Image: `data:${contentType};base64,${base64}`
                    });
                } catch (error) {
                    console.error(`Failed to fetch image: ${url}`, error.message);
                }
            }
        } catch (error) {
            console.log(`Error extracting images from ${chapterUrl}`, error);
            throw error;
        }

        return base64Images;
    }

    // public async searchMangaAsync(baseUrl?: string, keyword?: string): Promise<any[]> {
    //     const mangaInfos: MangaInfoResponse[] = [];
    //     if (baseUrl) {
    //         baseUrl = 'https://truyenqqgo.com'
    //     }
    //     console.log(baseUrl)

    //     const browser = await puppeteer.launch({
    //         headless: true,
    //         args: ['--no-sandbox', '--disable-setuid-sandbox'],
    //     });

    //     const page = await browser.newPage();
    //     const url = `https://truyenqqgo.com/tim-kiem.html?q=${keyword}`

    //     await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });


    //     const content = await page.content();
    //     const $ = cheerio.load(content);
    //     const results: any[] = [];

    //     $('.list_grid_out .list_grid_grid > li').each((_, element) => {
    //         const bookElement = $(element);

    //         const title = bookElement.find('.book_name').text().trim();
    //         const href = bookElement.find('.book_avatar a').attr('href');
    //         const img = bookElement.find('img').attr('src');
    //         const timeAgo = bookElement.find('.time-ago').text().trim();
    //         const isHot = bookElement.find('.type-label.hot').length > 0;

    //         results.push({
    //             title,
    //             href,
    //             img,
    //             timeAgo,
    //             isHot,
    //         });
    //     });
    //     await browser.close();
    //     return results;
    // }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
}
