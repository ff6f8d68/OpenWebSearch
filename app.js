// Required libraries
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const fs = require('fs');

const app = express();
app.use(express.json());

const CRAWL_LIMIT = 50;
const NUM_WORKERS = 10;

let crawledData = []; // Declare crawledData here as a global variable
let index = {};
let pagerankGraph = {};
let visitedUrls = new Set();

const DATA_FILE = 'web_crawler_data.json';

// Serve static files (e.g., images, CSS)
app.use(express.static('public'));

// Function to check robots.txt for permission to crawl
async function canCrawl(url) {
    try {
        const { protocol, host } = new URL(url);
        const robotsUrl = `${protocol}//${host}/robots.txt`;

        const response = await axios.get(robotsUrl, { timeout: 5000 });
        const disallowedPaths = response.data.split('\n')
            .filter(line => line.startsWith('Disallow'))
            .map(line => line.split(' ')[1]);

        const parsedUrl = new URL(url);
        return !disallowedPaths.some(path => parsedUrl.pathname.startsWith(path));
    } catch (err) {
        if (err.response && err.response.status === 404) {
            // If robots.txt does not exist, assume permission to crawl
            console.warn(`robots.txt not found for: ${url}. Assuming permission.`);
            return true;
        } else if (err.code === 'ENOTFOUND') {
            console.error(`Failed to resolve domain: ${url}. Skipping.`);
            return false;
        } else {
            console.error(`Failed to access robots.txt for ${url}: ${err.message}`);
            return false;
        }
    }
}

// Function to parse links from a webpage
function parseLinks($, currentUrl) {
    const urls = [];
    const hyperlinkConnections = new Set();

    $('a[href]').each((_, element) => {
        let href = $(element).attr('href');

        if (!href) return;
        if (href.startsWith('#')) return;

        const baseUrl = new URL(currentUrl);
        if (href.startsWith('//')) {
            href = `${baseUrl.protocol}${href}`;
        } else if (href.startsWith('/')) {
            href = `${baseUrl.origin}${href}`;
        } else if (!href.startsWith('http')) {
            return;
        }

        href = href.split('#')[0];
        hyperlinkConnections.add(href);
        urls.push(href);
    });

    return { urls, hyperlinkConnections: Array.from(hyperlinkConnections) };
}

// Function to crawl and index pages
async function crawl(queue, crawlLimit = CRAWL_LIMIT) {
    let crawlCount = 0;

    while (queue.length && crawlCount < crawlLimit) {
        const currentBatch = queue.splice(0, NUM_WORKERS);

        await Promise.all(currentBatch.map(async (currentUrl) => {
            if (visitedUrls.has(currentUrl)) return;
            visitedUrls.add(currentUrl);

            if (!(await canCrawl(currentUrl))) return;

            console.log(`Crawling: ${currentUrl}`);
            try {
                const response = await axios.get(currentUrl, { timeout: 5000 });
                const $ = cheerio.load(response.data);

                if (response.data.toLowerCase().includes('noindex')) {
                    console.log(`Noindex found, skipping: ${currentUrl}`);
                    return;
                }

                const title = $('title').text() || 'Untitled';
                const description = $('meta[name="description"]').attr('content') || '';

                console.log(`Page title: ${title}`);
                console.log(`Page description: ${description}`);

                crawledData.push({
                    url: currentUrl,
                    title,
                    description,
                });

                const { urls } = parseLinks($, currentUrl);
                urls.forEach(url => {
                    if (!visitedUrls.has(url)) queue.push(url);
                });

                crawlCount++;
            } catch (err) {
                console.error(`Failed to fetch ${currentUrl}: ${err.message}`);
            }
        }));
    }

    saveData();
}

// Save crawler data to a file
function saveData() {
    const data = { crawledData }; // Now uses the globally defined crawledData
    fs.promises.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('Data saved to file.');
}

// Load crawler data from a file
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        crawledData = data.crawledData || [];
        visitedUrls = new Set(crawledData.map(item => item.url));
        console.log('Data loaded from file.');
    }
}

// Main route serving the HTML page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/search.html');
});

// /search route to query the index
app.get('/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const lowerQuery = query.toLowerCase();
    const results = crawledData.filter(item => 
        item.url.toLowerCase().includes(lowerQuery) ||
        item.title.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery)
    ).slice(0, 50); // Limit to 50 results

    res.json({ results });
});

// /post route to add a new URL for crawling
app.post('/post', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const queue = [url];
    await crawl(queue);

    res.json({ message: 'Crawling complete' });
});

// Load data and start auto-crawling on startup
loadData();
(async () => {
    const initialQueue = [
        'https://www.wikipedia.org/',
        'https://www.bbc.com/news',
        'https://news.ycombinator.com/'
    ];
    await crawl(initialQueue);
})();

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
