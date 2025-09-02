import OpenAI from 'openai';
import dotenv from 'dotenv';

// Ensure dotenv is configured
dotenv.config();

class ContentProcessor {
  constructor() {
    console.log('Initializing ContentProcessor...');

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is missing from environment variables');
      throw new Error('OpenAI API key is required. Please set OPENAI_API_KEY in your .env file');
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async discoverCategories(pagesData) {
    try {
      const urlPaths = pagesData.map(page => ({
        url: page.url,
        path: new URL(page.url).pathname,
        title: page.title || 'Untitled'
      }));

      const prompt = `Analyze these website URLs and paths to discover the natural categories this website uses.

Website URLs and Paths:
${urlPaths.map(p => `- ${p.path} (${p.title})`).join('\n')}

Based on the URL patterns and page titles, determine the main content categories this website naturally organizes itself into. Look for patterns like:
- URL segments (/blog/, /docs/, /products/, etc.)
- Common prefixes or groupings
- Logical content organization

Respond with ONLY a valid JSON object listing the discovered categories:
{
  "categories": [
    "Category 1",
    "Category 2", 
    "Category 3"
  ]
}

Use the actual categories you can infer from the URLs, not generic ones. Be specific to this website.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing website structure and discovering natural content categories from URL patterns. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 200
      });

      let responseContent = response.choices[0].message.content.trim();
      
      // Remove markdown code blocks if present
      if (responseContent.startsWith('```json')) {
        responseContent = responseContent.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (responseContent.startsWith('```')) {
        responseContent = responseContent.replace(/```\n?/, '').replace(/\n?```$/, '');
      }
      
      const result = JSON.parse(responseContent);
      return result.categories || [];

    } catch (error) {
      console.error('Error discovering categories:', error);
      return ['General']; // Fallback
    }
  }

  async analyzePage(pageData, discoveredCategories) {
    if (!pageData.success || !pageData.textContent) {
      return null;
    }

    try {
      const prompt = `Analyze this webpage content and categorize it.

Title: ${pageData.title || 'Unknown'}
URL: ${pageData.url}
Path: ${new URL(pageData.url).pathname}
Description: ${pageData.description || 'None'}
Content: ${pageData.textContent.substring(0, 2000)}...

Available Categories for this website: ${discoveredCategories.join(', ')}

Please provide:
1. A concise 1-2 sentence description of what this page offers (suitable for llms.txt)
2. Which of the available categories this page best fits into
3. The main value proposition or purpose

Respond with ONLY a valid JSON object:
{
  "description": "Brief, compelling description",
  "category": "One of the available categories",
  "purpose": "Main purpose/value proposition"
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert content analyst. Create concise, compelling descriptions suitable for llms.txt files. Always respond with valid JSON only."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      let responseContent = response.choices[0].message.content.trim();
      
      // Remove markdown code blocks if present  
      if (responseContent.startsWith('```json')) {
        responseContent = responseContent.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (responseContent.startsWith('```')) {
        responseContent = responseContent.replace(/```\n?/, '').replace(/\n?```$/, '');
      }
      
      let analysis;
      try {
        analysis = JSON.parse(responseContent);
      } catch (parseError) {
        console.log('Failed to parse AI response for', pageData.url);
        console.log('Raw response:', response.choices[0].message.content);
        console.log('Cleaned response:', responseContent);
        throw parseError;
      }
      
      return {
        ...pageData,
        aiAnalysis: {
          description: analysis.description,
          category: analysis.category,
          purpose: analysis.purpose,
          processed: true
        }
      };

    } catch (error) {
      console.error(`Error analyzing page ${pageData.url}:`, error);
      
      // Fallback to basic analysis
      return {
        ...pageData,
        aiAnalysis: {
          description: this.generateFallbackDescription(pageData),
          category: this.inferCategoryFromUrl(pageData.url, discoveredCategories),
          purpose: pageData.description || pageData.title || 'Information resource',
          processed: false
        }
      };
    }
  }

  async generateSiteDescription(domain, pagesData) {
    try {
      const homePage = pagesData.find(page => 
        page.path === '/' || page.path === '' || page.url.endsWith(domain)
      );

      const samplePages = pagesData.slice(0, 5).map(page => ({
        title: page.title,
        url: page.url,
        description: page.description,
        category: page.aiAnalysis?.category
      }));

      const prompt = `Based on this website information, create a brief 1-2 sentence description of what this company/website does.

Domain: ${domain}
Home Page: ${homePage ? JSON.stringify({
  title: homePage.title,
  description: homePage.description,
  content: homePage.textContent?.substring(0, 500)
}) : 'Not available'}

Sample Pages: ${JSON.stringify(samplePages, null, 2)}

Create a concise description like: "Company helps brands gain visibility in AI-generated answers, optimize their presence in LLM-based answer engines, and stay competitive in the zero-click world."

Respond with just the description, no additional text.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at creating concise, compelling company descriptions for llms.txt files."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      return response.choices[0].message.content.trim();

    } catch (error) {
      console.error('Error generating site description:', error);
      return `${domain} - Information and resources`;
    }
  }

  generateFallbackDescription(pageData) {
    if (pageData.description) {
      return pageData.description;
    }

    if (pageData.title) {
      const category = this.inferCategoryFromUrl(pageData.url);
      return `${pageData.title} - ${category} content and information`;
    }

    return 'Information and resources';
  }

  inferCategoryFromUrl(url, discoveredCategories = ['General']) {
    const path = new URL(url).pathname.toLowerCase();
    
    // Try to match against discovered categories based on URL patterns
    for (const category of discoveredCategories) {
      const categoryLower = category.toLowerCase();
      if (path.includes(`/${categoryLower}`) || 
          path.includes(categoryLower) ||
          (categoryLower === 'home' && path === '/')) {
        return category;
      }
    }
    
    return discoveredCategories[0] || 'General';
  }

  async processPages(pagesData) {
    console.log('Step 1: Discovering categories from website structure...');
    
    // First, discover categories from the website structure
    const discoveredCategories = await this.discoverCategories(pagesData);
    console.log('Discovered categories:', discoveredCategories);
    
    console.log('Step 2: Analyzing individual pages...');
    
    const processedPages = [];
    
    // Process pages in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < pagesData.length; i += batchSize) {
      const batch = pagesData.slice(i, i + batchSize);
      
      const batchPromises = batch.map(page => this.analyzePage(page, discoveredCategories));
      const batchResults = await Promise.all(batchPromises);
      
      processedPages.push(...batchResults.filter(page => page !== null));
      
      // Add delay between batches
      if (i + batchSize < pagesData.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return processedPages;
  }
}

export default new ContentProcessor();