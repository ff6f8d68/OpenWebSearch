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

let index = {};
let webpageInfo = {};
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
        console.log(`Checking robots.txt for: ${robotsUrl}`);

        const response = await axios.get(robotsUrl, { timeout: 5000 });
        const disallowedPaths = response.data.split('\n')
            .filter(line => line.startsWith('Disallow'))
            .map(line => line.split(' ')[1]);

        const parsedUrl = new URL(url);
        return !disallowedPaths.some(path => parsedUrl.pathname.startsWith(path));
    } catch (err) {
        console.error(`Failed to access robots.txt: ${err.message}`);
        return false;
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

// Function to crawl a URL
// Function to crawl a URL and index it
// Function to crawl a URL and index it
// Function to crawl and index pages
// Function to crawl and index pages
async function crawl(queue, crawlLimit = CRAWL_LIMIT) {
    let crawlCount = 0;

    while (queue.length && crawlCount < crawlLimit) {
        const currentUrl = queue.shift();

        if (visitedUrls.has(currentUrl)) continue;
        visitedUrls.add(currentUrl);

        if (!(await canCrawl(currentUrl))) continue;

        console.log(`Crawling: ${currentUrl}`);

        try {
            const response = await axios.get(currentUrl, { timeout: 5000 });
            const $ = cheerio.load(response.data);

            // Skip if page has noindex
            if (response.data.toLowerCase().includes('noindex')) {
                console.log(`Noindex found, skipping: ${currentUrl}`);
                continue;
            }

            const title = $('title').text() || 'Untitled';
            const description = $('meta[name="description"]').attr('content') || 'No description';
            const bodyText = $('body').text().toLowerCase().replace(/\s+/g, ' ').trim(); // Clean up whitespace

            const webpageId = Object.keys(webpageInfo).length;
            webpageInfo[webpageId] = { url: currentUrl, title, description, bodyText };

            // Combine title, description, and body text into one string for indexing
            const indexText = `${title} ${description} ${bodyText}`.toLowerCase();
            const indexWords = indexText.split(/\s+/); // Split by spaces

            console.log(`Indexing words for ${currentUrl}: ${indexWords.slice(0, 10).join(", ")}`); // Log the first 10 words indexed

            // Index words
            indexWords.forEach(word => {
    if (!index[word]) {
        index[word] = new Set();
    }
    index[word].add(webpageId);
});

// Debugging: log the index to check if it's correctly populated
console.log(index);  // Add this to see the index structure


            // Extract links to follow
            const { urls } = parseLinks($, currentUrl);
            urls.forEach(url => {
                if (!visitedUrls.has(url)) {
                    queue.push(url);
                }
            });

            crawlCount++;
        } catch (err) {
            console.error(`Failed to fetch ${currentUrl}: ${err.message}`);
        }
    }

    saveData(); // Save the index data after crawling
}


// Save crawler data to a file
function saveData() {
    const data = { index, webpageInfo, pagerankGraph, visitedUrls: Array.from(visitedUrls) };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('Data saved to file.');
}

// Load crawler data from a file
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        index = data.index;
        webpageInfo = data.webpageInfo;
        pagerankGraph = data.pagerankGraph;
        visitedUrls = new Set(data.visitedUrls);
        console.log('Data loaded from file.');
    }
}

// Compute PageRank (placeholder function)
function computePagerank(graph) {
    const scores = {};
    Object.keys(graph).forEach(url => {
        scores[url] = Math.random(); // Random placeholder values
    });
    return scores;
}

// Main route serving the HTML page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/search.html');
});
// search route to query the index
// /search route to query the index
app.get('/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter q is required' });
    }

    // Normalize query and split by spaces (words)
    const queryWords = query.toLowerCase().split(/\s+/);

    console.log(`Searching for query: "${query}"`);
    const results = [];

    queryWords.forEach(word => {
        console.log(`Checking for word: "${word}" in index...`);
        
        // Check if the word exists in the index
        if (index[word]) {
            console.log(`Found word: "${word}", matching pages: ${Array.from(index[word])}`);
            
            // Add the matched webpages to the results
            index[word].forEach(webpageId => {
                if (!results[webpageId]) {
                    results[webpageId] = 0; // Initialize with weight 0
                }
                results[webpageId]++; // Increment match weight for the webpage
            });
        }
    });

    if (results.length === 0) {
        return res.json({ results: [] });  // No results found
    }

    // Sort results by weight (higher weight means more matches)
    const sortedResults = Object.entries(results)
        .sort(([, weightA], [, weightB]) => weightB - weightA) // Sort by descending weight
        .map(([webpageId]) => webpageInfo[webpageId]);

    console.log('Final search results:', sortedResults); // Log the final sorted results

    res.json({ results: sortedResults });
});



// /post route to add a new URL for crawling
app.post('/post', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const queue = [url];
    await crawl(queue);

    const pagerankScores = computePagerank(pagerankGraph);
    res.json({ message: 'Crawling complete', pagerankScores });
});

// /get route for search button functionality
app.get('/get', (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const results = [];
    const queryWords = query.toLowerCase().split(' ');

    for (const word of queryWords) {
        if (index[word]) {
            results.push(...Array.from(index[word]));
        }
    }

    const uniqueResults = Array.from(new Set(results))
        .slice(0, 50) // Limit to 50 results
        .map(id => webpageInfo[id]);

    res.json({ results: uniqueResults });
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
