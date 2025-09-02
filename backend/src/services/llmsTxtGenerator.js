class LlmsTxtGenerator {
  generateStructuredContent(domain, siteDescription, processedPages) {
    // Filter out pages that shouldn't be included
    const validPages = processedPages.filter(page => 
      page.aiAnalysis && 
      !this.shouldExcludePage(page.url) &&
      page.title &&
      page.aiAnalysis.description
    );

    // Group pages by category
    const categorizedPages = this.categorizePages(validPages);

    // Generate the structured content
    let content = `# ${domain}\n\n`;
    content += `> ${siteDescription}\n\n`;

    // Add each category section
    const categoryOrder = [
      'Blog',
      'Guides', 
      'Features',
      'Products',
      'Services',
      'Customers',
      'About',
      'Careers',
      'Support',
      'Documentation',
      'Pricing',
      'Contact',
      'Login',
      'Registration',
      'Privacy Policy',
      'Terms',
      'General'
    ];

    for (const category of categoryOrder) {
      if (categorizedPages[category] && categorizedPages[category].length > 0) {
        content += this.generateCategorySection(category, categorizedPages[category]);
      }
    }

    // Add any remaining categories not in the predefined order
    for (const [category, pages] of Object.entries(categorizedPages)) {
      if (!categoryOrder.includes(category) && pages.length > 0) {
        content += this.generateCategorySection(category, pages);
      }
    }

    return content.trim();
  }

  categorizePages(pages) {
    const categories = {};

    pages.forEach(page => {
      const category = page.aiAnalysis.category || 'General';
      
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push({
        title: page.title,
        url: page.url,
        description: page.aiAnalysis.description,
        path: page.path
      });
    });

    // Sort pages within each category by path (to group related pages)
    for (const category in categories) {
      categories[category].sort((a, b) => {
        // Prioritize main category pages (shorter paths)
        if (a.path.split('/').length !== b.path.split('/').length) {
          return a.path.split('/').length - b.path.split('/').length;
        }
        return a.path.localeCompare(b.path);
      });
    }

    return categories;
  }

  generateCategorySection(category, pages) {
    let section = `\n## ${category}\n\n`;
    
    pages.forEach(page => {
      section += `- [${page.title}](${page.url}): ${page.description}\n`;
    });
    
    return section;
  }

  shouldExcludePage(url) {
    const excludePatterns = [
      /\/404/,
      /\/error/,
      /\/search$/,
      /\/thank-you/,
      /\/confirmation/,
      /\/unsubscribe/,
      /\/sitemap/,
      /\/robots\.txt/,
      /\/admin/,
      /\/wp-/,
      /\/assets\//,
      /\/static\//,
      /\/images\//,
      /\/css\//,
      /\/js\//,
      /\.(pdf|doc|docx|xls|xlsx|zip|rar)$/i
    ];

    return excludePatterns.some(pattern => pattern.test(url));
  }

  generateSummaryStats(processedPages) {
    const validPages = processedPages.filter(page => 
      page.aiAnalysis && !this.shouldExcludePage(page.url)
    );

    const categories = this.categorizePages(validPages);
    const totalWords = validPages.reduce((sum, page) => sum + (page.wordCount || 0), 0);

    return {
      totalPages: validPages.length,
      totalWords,
      categories: Object.keys(categories).length,
      categoriesBreakdown: Object.fromEntries(
        Object.entries(categories).map(([cat, pages]) => [cat, pages.length])
      )
    };
  }
}

export default new LlmsTxtGenerator();