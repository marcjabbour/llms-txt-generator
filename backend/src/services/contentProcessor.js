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

  async analyzePage(pageData) {
    if (!pageData.success || !pageData.textContent) {
      return null;
    }

    try {
      const prompt = `Analyze this webpage content and extract key information.

Title: ${pageData.title || 'Unknown'}
URL: ${pageData.url}
Description: ${pageData.description || 'None'}
Content: ${pageData.textContent.substring(0, 2000)}...

Please provide:
1. A concise 1-2 sentence description of what this page offers (like the examples in an llms.txt file)
2. The primary category this page belongs to (Blog, Guides, Features, Products, About, Customers, Careers, etc.)
3. The main value proposition or purpose

Respond with ONLY a valid JSON object (no markdown, no code blocks, no additional text):
{
  "description": "Brief, compelling description",
  "category": "Primary category", 
  "purpose": "Main purpose/value proposition"
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert content analyst. Create concise, compelling descriptions suitable for llms.txt files that help AI systems understand website content. Always respond with valid JSON only, no markdown formatting or code blocks."
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
          category: this.inferCategoryFromUrl(pageData.url),
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

  inferCategoryFromUrl(url) {
    const path = new URL(url).pathname.toLowerCase();
    
    if (path.includes('/blog')) return 'Blog';
    if (path.includes('/guide') || path.includes('/tutorial')) return 'Guides';
    if (path.includes('/feature') || path.includes('/product')) return 'Features';
    if (path.includes('/about')) return 'About';
    if (path.includes('/contact')) return 'Contact';
    if (path.includes('/customer') || path.includes('/case-stud')) return 'Customers';
    if (path.includes('/career') || path.includes('/job')) return 'Careers';
    if (path.includes('/pricing')) return 'Pricing';
    if (path.includes('/login') || path.includes('/signin')) return 'Login';
    if (path.includes('/signup') || path.includes('/register')) return 'Registration';
    if (path.includes('/privacy')) return 'Privacy Policy';
    if (path.includes('/terms')) return 'Terms';
    if (path.includes('/help') || path.includes('/support')) return 'Support';
    if (path.includes('/api') || path.includes('/docs')) return 'Documentation';
    
    return 'General';
  }

  async processPages(pagesData) {
    const processedPages = [];
    
    // Process pages in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < pagesData.length; i += batchSize) {
      const batch = pagesData.slice(i, i + batchSize);
      
      const batchPromises = batch.map(page => this.analyzePage(page));
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