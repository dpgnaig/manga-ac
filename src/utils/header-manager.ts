export class HeaderManager {
    private static readonly baseUserAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    private static readonly baseAcceptLanguage = 'en-US,en;q=0.9';

    static getImageHeaders(refererUrl: string): Record<string, string> {
        return {
            'User-Agent': this.baseUserAgent,
            Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': this.baseAcceptLanguage,
            Referer: refererUrl,
        };
    }
}
