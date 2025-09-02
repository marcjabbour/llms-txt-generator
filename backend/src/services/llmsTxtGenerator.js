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

    // Sort categories by importance and page count
    const sortedCategories = Object.entries(categorizedPages)
      .filter(([_, pages]) => pages.length > 0)
      .sort(([categoryA, pagesA], [categoryB, pagesB]) => {
        // Prioritize certain categories if they exist
        const importantCategories = ['Home', 'Products', 'Features', 'Services', 'Blog', 'Guides', 'Documentation'];
        const aImportant = importantCategories.indexOf(categoryA);
        const bImportant = importantCategories.indexOf(categoryB);
        
        if (aImportant !== -1 && bImportant !== -1) {
          return aImportant - bImportant; // Both important, use predefined order
        }
        if (aImportant !== -1) return -1; // A is important, B is not
        if (bImportant !== -1) return 1;  // B is important, A is not
        
        // Neither is in important list, sort by page count (descending)
        if (pagesB.length !== pagesA.length) {
          return pagesB.length - pagesA.length;
        }
        
        // Same page count, sort alphabetically
        return categoryA.localeCompare(categoryB);
      });

    // Add each category section
    for (const [category, pages] of sortedCategories) {
      content += this.generateCategorySection(category, pages);
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