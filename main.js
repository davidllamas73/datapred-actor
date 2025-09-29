// Puppeteer Actor for DataPred - Analyzes Data Sources for Shrimp Price Forecasting
// Uses Puppeteer for dynamic content extraction

const { Actor } = require('apify');
const { PuppeteerCrawler, Dataset, KeyValueStore } = require('crawlee');

Actor.main(async () => {
    const input = await Actor.getInput();
    const {
        startUrl = 'https://app.datapred.com/',
        loginUrl = 'https://app.datapred.com/login',
        username = '',  // Your DataPred username
        password = '',  // Your DataPred password
        maxPages = 20,
        waitForTimeout = 5000,
        screenshotEnabled = true,
        extractDataSources = true,
        extractMarkets = true,
        extractMethodology = true,
    } = input || {};

    // Store found data
    const dataSourcesFound = [];
    const marketsAnalyzed = [];
    const methodologyInfo = [];
    const forecastingModels = [];
    const apiEndpoints = [];
    const dataProviders = [];

    // Common shrimp-related keywords to look for
    const shrimpKeywords = [
        'shrimp', 'prawn', 'vannamei', 'whiteleg', 'black tiger', 'monodon',
        'aquaculture', 'seafood', 'marine', 'farming', 'pond', 'harvest'
    ];

    // Potential data source keywords
    const dataSourceKeywords = [
        'bloomberg', 'reuters', 'usda', 'fao', 'noaa', 'globefish',
        'undercurrent', 'seafood source', 'infofish', 'vietnam customs',
        'india export', 'ecuador export', 'thailand', 'indonesia',
        'weather', 'satellite', 'commodity', 'futures', 'exchange rate',
        'api', 'data provider', 'source', 'feed', 'integration'
    ];

    // Market-related keywords
    const marketKeywords = [
        'usa', 'europe', 'china', 'japan', 'vietnam', 'india', 'ecuador',
        'thailand', 'indonesia', 'wholesale', 'retail', 'import', 'export',
        'price', 'forecast', 'prediction', 'trend', 'market', 'analysis'
    ];

    // Function to perform login
    async function performLogin(page) {
        if (!username || !password) {
            console.log('⚠️ No credentials provided. Will analyze public areas only.');
            return false;
        }

        console.log('🔐 Attempting to login to DataPred...');
        
        try {
            await page.goto(loginUrl, { waitUntil: 'networkidle2' });
            
            // Wait for login form
            await page.waitForSelector('input[type="email"], input[type="text"], input[name="username"], input[name="email"]', { timeout: 10000 });
            
            // Find and fill username field
            const usernameSelectors = [
                'input[type="email"]',
                'input[name="username"]',
                'input[name="email"]',
                'input[type="text"]:first-of-type'
            ];
            
            for (const selector of usernameSelectors) {
                if (await page.$(selector)) {
                    await page.type(selector, username);
                    break;
                }
            }
            
            // Find and fill password field
            const passwordSelectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[name="pwd"]'
            ];
            
            for (const selector of passwordSelectors) {
                if (await page.$(selector)) {
                    await page.type(selector, password);
                    break;
                }
            }
            
            // Submit form
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:contains("Login")',
                'button:contains("Sign in")'
            ];
            
            for (const selector of submitSelectors) {
                if (await page.$(selector)) {
                    await Promise.all([
                        page.click(selector),
                        page.waitForNavigation({ waitUntil: 'networkidle2' })
                    ]);
                    break;
                }
            }
            
            // Check if login was successful
            await page.waitForTimeout(3000);
            const currentUrl = page.url();
            
            if (currentUrl.includes('dashboard') || currentUrl.includes('app') || !currentUrl.includes('login')) {
                console.log('✅ Login successful!');
                return true;
            }
            
            console.log('⚠️ Login might have failed. Will continue with limited access.');
            return false;
            
        } catch (error) {
            console.error('❌ Login error:', error.message);
            return false;
        }
    }

    // Function to extract data sources from page
    async function extractDataSourcesFromPage(page) {
        const sources = await page.evaluate((keywords) => {
            const foundSources = [];
            const allText = document.body.innerText.toLowerCase();
            
            // Look for data source mentions
            keywords.forEach(keyword => {
                if (allText.includes(keyword)) {
                    // Try to find context around the keyword
                    const regex = new RegExp(`.{0,50}${keyword}.{0,50}`, 'gi');
                    const matches = allText.match(regex);
                    if (matches) {
                        matches.forEach(match => {
                            foundSources.push({
                                source: keyword,
                                context: match.trim(),
                                found: true
                            });
                        });
                    }
                }
            });
            
            // Look for API endpoints
            const scripts = Array.from(document.querySelectorAll('script'));
            scripts.forEach(script => {
                const content = script.innerText;
                const apiMatches = content.match(/(?:api|endpoint|feed|source).*?(?:url|uri|path).*?['"](.*?)['"]/gi);
                if (apiMatches) {
                    apiMatches.forEach(match => {
                        foundSources.push({
                            type: 'api',
                            endpoint: match,
                            found: true
                        });
                    });
                }
            });
            
            // Look for data provider logos/images
            const images = Array.from(document.querySelectorAll('img'));
            images.forEach(img => {
                const src = img.src?.toLowerCase() || '';
                const alt = img.alt?.toLowerCase() || '';
                const title = img.title?.toLowerCase() || '';
                
                keywords.forEach(keyword => {
                    if (src.includes(keyword) || alt.includes(keyword) || title.includes(keyword)) {
                        foundSources.push({
                            type: 'logo/image',
                            source: keyword,
                            imageSrc: img.src,
                            found: true
                        });
                    }
                });
            });
            
            return foundSources;
        }, dataSourceKeywords);
        
        return sources;
    }

    // Function to extract market information
    async function extractMarketInfo(page) {
        const markets = await page.evaluate((keywords) => {
            const foundMarkets = [];
            
            // Look for market-related elements
            const selectors = [
                'select', 'dropdown', '.market', '.region', '.country',
                '[data-market]', '[data-region]', '[data-country]'
            ];
            
            selectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    const text = el.innerText || el.value || '';
                    keywords.forEach(keyword => {
                        if (text.toLowerCase().includes(keyword)) {
                            foundMarkets.push({
                                market: keyword,
                                element: selector,
                                text: text.substring(0, 100),
                                found: true
                            });
                        }
                    });
                });
            });
            
            // Look for charts and graphs
            const chartElements = document.querySelectorAll('canvas, svg, .chart, .graph, [class*="chart"], [id*="chart"]');
            if (chartElements.length > 0) {
                foundMarkets.push({
                    type: 'visualization',
                    count: chartElements.length,
                    message: `Found ${chartElements.length} chart/graph elements`
                });
            }
            
            return foundMarkets;
        }, marketKeywords);
        
        return markets;
    }

    // Function to intercept network requests
    async function interceptNetworkRequests(page) {
        const requests = [];
        
        page.on('request', request => {
            const url = request.url();
            const method = request.method();
            
            // Look for API calls and data endpoints
            if (url.includes('api') || url.includes('data') || url.includes('forecast') || 
                url.includes('price') || url.includes('shrimp')) {
                requests.push({
                    url: url,
                    method: method,
                    type: request.resourceType(),
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        page.on('response', response => {
            const url = response.url();
            const status = response.status();
            
            // Track successful data responses
            if (status === 200 && (url.includes('api') || url.includes('data'))) {
                apiEndpoints.push({
                    url: url,
                    status: status,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        return requests;
    }

    // Configure Puppeteer crawler
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: maxPages,
        maxConcurrency: 1,  // Single browser instance for session consistency
        
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        },
        
        preNavigationHooks: [
            async ({ page, request }) => {
                // Set up network interception
                await interceptNetworkRequests(page);
                
                // Set viewport
                await page.setViewport({ width: 1920, height: 1080 });
            },
        ],
        
        async requestHandler({ request, page, log }) {
            log.info(`Processing ${request.url}...`);
            
            // Login on first request if credentials provided
            if (request.url === startUrl && username && password) {
                const loginSuccess = await performLogin(page);
                if (loginSuccess) {
                    // Navigate back to main app after login
                    await page.goto(startUrl, { waitUntil: 'networkidle2' });
                }
            } else {
                await page.goto(request.url, { waitUntil: 'networkidle2' });
            }
            
            // Wait for dynamic content
            await page.waitForTimeout(waitForTimeout);
            
            // Take screenshot if enabled
            if (screenshotEnabled) {
                const screenshotBuffer = await page.screenshot({ fullPage: true });
                const store = await KeyValueStore.open();
                await store.setValue(
                    `screenshot_${Date.now()}.png`,
                    screenshotBuffer,
                    { contentType: 'image/png' }
                );
            }
            
            // Extract data sources
            if (extractDataSources) {
                const sources = await extractDataSourcesFromPage(page);
                dataSourcesFound.push(...sources);
                
                if (sources.length > 0) {
                    log.info(`📊 Found ${sources.length} data source references`);
                }
            }
            
            // Extract market information
            if (extractMarkets) {
                const markets = await extractMarketInfo(page);
                marketsAnalyzed.push(...markets);
                
                if (markets.length > 0) {
                    log.info(`🌍 Found ${markets.length} market references`);
                }
            }
            
            // Look for methodology or about pages
            if (extractMethodology) {
                const methodologyLinks = await page.evaluate(() => {
                    const links = [];
                    const anchors = document.querySelectorAll('a');
                    anchors.forEach(a => {
                        const href = a.href?.toLowerCase() || '';
                        const text = a.innerText?.toLowerCase() || '';
                        if (text.includes('methodology') || text.includes('about') || 
                            text.includes('how it works') || text.includes('data source') ||
                            href.includes('methodology') || href.includes('about')) {
                            links.push({
                                url: a.href,
                                text: a.innerText,
                                type: 'methodology_link'
                            });
                        }
                    });
                    return links;
                });
                
                methodologyInfo.push(...methodologyLinks);
            }
            
            // Look for specific shrimp-related content
            const shrimpContent = await page.evaluate((keywords) => {
                const content = [];
                const allText = document.body.innerText.toLowerCase();
                
                keywords.forEach(keyword => {
                    if (allText.includes(keyword)) {
                        content.push({
                            keyword: keyword,
                            found: true,
                            url: window.location.href
                        });
                    }
                });
                
                return content;
            }, shrimpKeywords);
            
            if (shrimpContent.length > 0) {
                log.info(`🦐 Found shrimp-related content: ${shrimpContent.map(c => c.keyword).join(', ')}`);
            }
            
            // Extract visible data tables
            const tables = await page.evaluate(() => {
                const tableData = [];
                const tables = document.querySelectorAll('table');
                
                tables.forEach((table, index) => {
                    const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
                    const rows = table.querySelectorAll('tbody tr').length || table.querySelectorAll('tr').length;
                    
                    if (headers.length > 0 || rows > 0) {
                        tableData.push({
                            index: index,
                            headers: headers,
                            rowCount: rows,
                            url: window.location.href
                        });
                    }
                });
                
                return tableData;
            });
            
            if (tables.length > 0) {
                log.info(`📋 Found ${tables.length} data tables`);
                methodologyInfo.push(...tables.map(t => ({ ...t, type: 'data_table' })));
            }
            
            // Look for navigation elements to find more pages
            const navigationLinks = await page.evaluate(() => {
                const links = [];
                const selectors = ['nav a', '.menu a', '.sidebar a', '[role="navigation"] a'];
                
                selectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (el.href && !el.href.includes('logout') && !el.href.includes('#')) {
                            links.push({
                                url: el.href,
                                text: el.innerText.trim()
                            });
                        }
                    });
                });
                
                return links;
            });
            
            // Add relevant navigation links to crawl
            for (const link of navigationLinks) {
                const relevantKeywords = ['data', 'source', 'market', 'price', 'forecast', 
                                        'shrimp', 'seafood', 'analysis', 'report', 'insight'];
                
                if (relevantKeywords.some(keyword => link.text.toLowerCase().includes(keyword))) {
                    await crawler.addRequests([link.url]);
                }
            }
        },
        
        failedRequestHandler({ request, log }) {
            log.error(`Request ${request.url} failed.`);
        },
    });

    // Run the crawler
    console.log('\n🚀 Starting DataPred analysis...\n');
    await crawler.run([startUrl]);

    // Process and deduplicate results
    const uniqueDataSources = [...new Set(dataSourcesFound.map(s => JSON.stringify(s)))].map(s => JSON.parse(s));
    const uniqueMarkets = [...new Set(marketsAnalyzed.map(m => JSON.stringify(m)))].map(m => JSON.parse(m));
    const uniqueAPIs = [...new Set(apiEndpoints.map(a => a.url))].map(url => 
        apiEndpoints.find(a => a.url === url)
    );

    // Identify specific data providers
    const identifiedProviders = new Set();
    uniqueDataSources.forEach(source => {
        if (source.source) {
            identifiedProviders.add(source.source);
        }
    });

    // Generate analysis results
    const results = {
        analysisDate: new Date().toISOString(),
        platform: 'DataPred',
        url: startUrl,
        authenticated: username && password ? true : false,
        
        dataSources: {
            identified: Array.from(identifiedProviders),
            total: uniqueDataSources.length,
            details: uniqueDataSources.slice(0, 50),  // Limit to first 50 for readability
            apiEndpoints: uniqueAPIs,
        },
        
        markets: {
            identified: [...new Set(uniqueMarkets.filter(m => m.market).map(m => m.market))],
            total: uniqueMarkets.length,
            details: uniqueMarkets.slice(0, 30),
        },
        
        methodology: {
            links: methodologyInfo.filter(m => m.type === 'methodology_link'),
            dataTables: methodologyInfo.filter(m => m.type === 'data_table'),
        },
        
        shrimpSpecific: {
            hasShrimpContent: shrimpKeywords.some(keyword => 
                dataSourcesFound.some(s => s.context?.includes(keyword)) ||
                marketsAnalyzed.some(m => m.text?.includes(keyword))
            ),
            shrimpKeywordsFound: shrimpKeywords.filter(keyword =>
                uniqueDataSources.some(s => s.context?.includes(keyword))
            ),
        },
        
        summary: {
            likelyDataProviders: [],
            marketsCovered: [],
            dataTypes: [],
            updateFrequency: 'Unknown - requires authenticated access',
        },
        
        recommendations: []
    };

    // Analyze findings and generate insights
    if (identifiedProviders.size > 0) {
        results.summary.likelyDataProviders = Array.from(identifiedProviders);
        results.recommendations.push(
            `✅ Identified ${identifiedProviders.size} potential data providers: ${Array.from(identifiedProviders).join(', ')}`
        );
    }

    if (results.markets.identified.length > 0) {
        results.summary.marketsCovered = results.markets.identified;
        results.recommendations.push(
            `🌍 Platform covers ${results.markets.identified.length} markets including: ${results.markets.identified.slice(0, 5).join(', ')}`
        );
    }

    if (uniqueAPIs.length > 0) {
        results.recommendations.push(
            `📡 Found ${uniqueAPIs.length} API endpoints that may be fetching real-time data`
        );
    }

    if (!results.shrimpSpecific.hasShrimpContent) {
        results.recommendations.push(
            '⚠️ Limited shrimp-specific content found. May need authenticated access to view shrimp forecasting features.'
        );
    }

    if (!username || !password) {
        results.recommendations.push(
            '🔐 Analysis was limited to public areas. Provide credentials for comprehensive data source analysis.'
        );
    }

    results.recommendations.push(
        '💡 To get complete data source information, look for: Settings > Data Sources, About > Methodology, or API Documentation sections when logged in.'
    );

    // Save results
    await Dataset.pushData(results);

    // Save detailed JSON report
    const store = await KeyValueStore.open();
    await store.setValue('analysis_report.json', JSON.stringify(results, null, 2));

    // Log summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 DATAPRED ANALYSIS COMPLETE');
    console.log('='.repeat(60));
    console.log(`🔐 Authentication: ${results.authenticated ? 'YES ✅' : 'NO ❌'}`);
    console.log(`📊 Data sources identified: ${results.dataSources.identified.length}`);
    console.log(`🌍 Markets identified: ${results.markets.identified.length}`);
    console.log(`📡 API endpoints found: ${results.dataSources.apiEndpoints.length}`);
    console.log(`🦐 Shrimp-specific content: ${results.shrimpSpecific.hasShrimpContent ? 'YES ✅' : 'LIMITED ⚠️'}`);

    if (results.dataSources.identified.length > 0) {
        console.log('\n📊 IDENTIFIED DATA SOURCES:');
        results.dataSources.identified.forEach(source => {
            console.log(`  - ${source}`);
        });
    }

    if (results.markets.identified.length > 0) {
        console.log('\n🌍 IDENTIFIED MARKETS:');
        results.markets.identified.slice(0, 10).forEach(market => {
            console.log(`  - ${market}`);
        });
    }

    if (results.recommendations.length > 0) {
        console.log('\n💡 INSIGHTS & RECOMMENDATIONS:');
        results.recommendations.forEach(rec => console.log(`  ${rec}`));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📂 Full analysis report saved to Key-Value store');
    console.log('='.repeat(60) + '\n');
});
