import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import configManager from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TESTING_DIR = path.join(__dirname, 'testing');
const TESTS_FILE = path.join(TESTING_DIR, 'prompt-tests.json');
const TEST_RESULTS_FILE = path.join(TESTING_DIR, 'test-results.json');

// Default test configuration
const DEFAULT_TEST_CONFIG = {
  maxTestsPerPrompt: 10,
  testTimeout: 30000, // 30 seconds
  qualityThreshold: 0.7,
  variablePresets: {
    topic: ['inteligencia artificial', 'marketing digital', 'desarrollo web', 'blockchain', 'sostenibilidad'],
    tone: ['profesional', 'casual', 'creativo', 'persuasivo', 'informativo'],
    platform: ['Twitter', 'LinkedIn', 'Instagram', 'Facebook']
  }
};

class PromptTestingManager {
  constructor() {
    this.tests = new Map();
    this.results = new Map();
    this.testConfig = { ...DEFAULT_TEST_CONFIG };
    this.listeners = new Set();
  }

  async init() {
    try {
      await fs.mkdir(TESTING_DIR, { recursive: true });
      await this.loadTests();
      await this.loadResults();
    } catch (error) {
      console.error('Error initializing prompt testing manager:', error);
    }
  }

  async loadTests() {
    try {
      const data = await fs.readFile(TESTS_FILE, 'utf8');
      const tests = JSON.parse(data);
      this.tests = new Map(Object.entries(tests));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading tests:', error);
      }
    }
  }

  async loadResults() {
    try {
      const data = await fs.readFile(TEST_RESULTS_FILE, 'utf8');
      const results = JSON.parse(data);
      this.results = new Map(Object.entries(results));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading results:', error);
      }
    }
  }

  async saveTests() {
    try {
      const testsObj = Object.fromEntries(this.tests);
      await fs.writeFile(TESTS_FILE, JSON.stringify(testsObj, null, 2));
    } catch (error) {
      console.error('Error saving tests:', error);
      throw error;
    }
  }

  async saveResults() {
    try {
      const resultsObj = Object.fromEntries(this.results);
      await fs.writeFile(TEST_RESULTS_FILE, JSON.stringify(resultsObj, null, 2));
    } catch (error) {
      console.error('Error saving results:', error);
      throw error;
    }
  }

  createTest(promptId, promptData, testConfig = {}) {
    // Security validations
    if (!promptId || typeof promptId !== 'string') {
      throw new Error('Invalid prompt ID');
    }
    
    if (!promptData || !promptData.content || typeof promptData.content !== 'string') {
      throw new Error('Invalid prompt data');
    }
    
    // Content length validation
    if (promptData.content.length > 5000) {
      throw new Error('Prompt content too long (max 5000 characters)');
    }
    
    // Rate limiting: check number of tests in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTests = Array.from(this.tests.values()).filter(test => 
      new Date(test.createdAt) > oneHourAgo
    );
    
    if (recentTests.length >= 50) {
      throw new Error('Too many tests created recently. Please wait before creating more tests.');
    }
    
    // Check total active tests
    if (this.tests.size >= this.testConfig.maxTestsPerPrompt * 10) {
      throw new Error('Maximum number of tests reached. Please delete some tests first.');
    }
    
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const test = {
      id: testId,
      promptId,
      promptContent: promptData.content,
      promptName: promptData.name,
      variables: promptData.variables || [],
      testVariables: testConfig.testVariables || this.generateTestVariables(promptData.variables || []),
      config: {
        ...this.testConfig,
        ...testConfig
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      priority: testConfig.priority || 'normal'
    };

    this.tests.set(testId, test);
    this.notifyListeners('testCreated', test);
    
    return test;
  }

  generateTestVariables(variables) {
    const testVars = {};
    
    variables.forEach(variable => {
      if (this.testConfig.variablePresets[variable]) {
        const presets = this.testConfig.variablePresets[variable];
        testVars[variable] = presets[Math.floor(Math.random() * presets.length)];
      } else {
        // Generate generic test data
        switch (variable) {
          case 'topic':
            testVars[variable] = 'tecnología';
            break;
          case 'tone':
            testVars[variable] = 'profesional';
            break;
          case 'platform':
            testVars[variable] = 'Twitter';
            break;
          default:
            testVars[variable] = `test_${variable}`;
        }
      }
    });

    return testVars;
  }

  async runTest(testId) {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error('Test not found');
    }

    if (test.status === 'running') {
      throw new Error('Test is already running');
    }

    test.status = 'running';
    test.startedAt = new Date().toISOString();
    this.notifyListeners('testStarted', test);

    try {
      // Get current LLM configuration
      const llmConfig = configManager.get('llm');
      
      // Replace variables in prompt
      let promptContent = test.promptContent;
      Object.entries(test.testVariables).forEach(([key, value]) => {
        promptContent = promptContent.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      });

      // Prepare the request
      const startTime = Date.now();
      
      // Mock LLM call for now - in real implementation, this would call the actual LLM
      const mockResponse = await this.mockLLMCall(promptContent, llmConfig);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Evaluate the result
      const evaluation = this.evaluateResult(mockResponse, test);

      const result = {
        testId,
        promptContent,
        variables: test.testVariables,
        response: mockResponse,
        metrics: {
          responseTime,
          quality: evaluation.quality,
          length: mockResponse.length,
          estimatedCost: this.estimateCost(promptContent, mockResponse, llmConfig),
          meetsRequirements: evaluation.meetsRequirements
        },
        evaluation: evaluation.details,
        completedAt: new Date().toISOString(),
        status: 'completed'
      };

      test.status = 'completed';
      test.result = result;
      
      this.results.set(testId, result);
      this.notifyListeners('testCompleted', { test, result });
      
      // Save results
      await this.saveResults();
      
      return result;
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
      
      const result = {
        testId,
        error: error.message,
        failedAt: new Date().toISOString(),
        status: 'failed'
      };
      
      this.results.set(testId, result);
      this.notifyListeners('testFailed', { test, error: error.message });
      
      await this.saveResults();
      
      throw error;
    }
  }

  async mockLLMCall(prompt, config) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // Mock responses based on prompt content
    if (prompt.includes('inteligencia artificial')) {
      return 'La inteligencia artificial está revolucionando la forma en que trabajamos y vivimos. Desde asistentes virtuales hasta diagnósticos médicos, la IA está transformando industrias enteras. #InteligenciaArtificial #Innovación #Tecnología';
    } else if (prompt.includes('marketing digital')) {
      return 'El marketing digital es esencial para el éxito empresarial en la era actual. Estrategias efectivas incluyen SEO, contenido de valor y redes sociales. #MarketingDigital #Negocios #Estrategia';
    } else if (prompt.includes('desarrollo web')) {
      return 'El desarrollo web evoluciona constantemente con nuevas tecnologías. Frameworks modernos como React y Vue.js facilitan la creación de aplicaciones interactivas. #DesarrolloWeb #Programación #Tecnología';
    } else {
      return 'Contenido generado exitosamente basado en el prompt proporcionado. Este es un resultado de prueba que simula la respuesta de un modelo de lenguaje.';
    }
  }

  evaluateResult(response, test) {
    const quality = this.calculateQuality(response, test);
    const meetsRequirements = this.checkRequirements(response, test);
    
    return {
      quality,
      meetsRequirements,
      details: {
        length: response.length,
        hasHashtags: response.includes('#'),
        hasMentions: response.includes('@'),
        readability: this.calculateReadability(response),
        engagement: this.estimateEngagement(response)
      }
    };
  }

  calculateQuality(response, test) {
    let score = 0.5; // Base score
    
    // Length check
    const contentConfig = configManager.get('content');
    if (response.length >= contentConfig.minLength && response.length <= contentConfig.maxLength) {
      score += 0.2;
    }
    
    // Hashtags
    if (response.includes('#')) {
      score += 0.1;
    }
    
    // Readability
    const readability = this.calculateReadability(response);
    score += (readability / 100) * 0.2;
    
    return Math.min(score, 1.0);
  }

  calculateReadability(text) {
    // Simple readability calculation
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    
    if (sentences === 0 || words === 0) return 0;
    
    const avgWordsPerSentence = words / sentences;
    return Math.min(100, (avgWordsPerSentence < 20 ? 100 : 80));
  }

  estimateEngagement(text) {
    let score = 0;
    
    // Hashtags increase engagement
    const hashtagCount = (text.match(/#/g) || []).length;
    score += Math.min(hashtagCount * 0.1, 0.3);
    
    // Questions increase engagement
    if (text.includes('?')) {
      score += 0.2;
    }
    
    // Call to action
    if (text.match(/(descubre|mira|aprende|comparte)/i)) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  checkRequirements(response, test) {
    const contentConfig = configManager.get('content');
    
    return response.length >= contentConfig.minLength && 
           response.length <= contentConfig.maxLength &&
           response.length > 0;
  }

  estimateCost(prompt, response, config) {
    // Rough estimation based on token count
    const promptTokens = prompt.split(/\s+/).length * 1.3;
    const responseTokens = response.split(/\s+/).length * 1.3;
    const totalTokens = promptTokens + responseTokens;
    
    // Cost per 1K tokens (rough estimate)
    const costPer1K = 0.002;
    return (totalTokens / 1000) * costPer1K;
  }

  async runBatchTests(promptId, testCount = 5) {
    const tests = [];
    const results = [];
    
    for (let i = 0; i < testCount; i++) {
      const test = this.createTest(promptId, { 
        content: `Test ${i + 1} - Prompt de prueba`,
        name: `Test ${i + 1}`,
        variables: ['topic', 'tone']
      });
      tests.push(test);
    }
    
    // Run tests sequentially to avoid overwhelming the API
    for (const test of tests) {
      try {
        const result = await this.runTest(test.id);
        results.push(result);
      } catch (error) {
        console.error(`Test ${test.id} failed:`, error);
      }
    }
    
    return {
      total: tests.length,
      completed: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
      averageQuality: results.reduce((sum, r) => sum + (r.metrics?.quality || 0), 0) / results.length,
      averageResponseTime: results.reduce((sum, r) => sum + (r.metrics?.responseTime || 0), 0) / results.length,
      results
    };
  }

  compareTests(testIds) {
    const comparison = {
      tests: [],
      summary: {
        bestQuality: null,
        fastestResponse: null,
        mostCostEffective: null
      }
    };
    
    let bestQuality = { score: -1, testId: null };
    let fastestResponse = { time: Infinity, testId: null };
    let mostCostEffective = { cost: Infinity, testId: null };
    
    testIds.forEach(testId => {
      const result = this.results.get(testId);
      if (result && result.status === 'completed') {
        comparison.tests.push(result);
        
        if (result.metrics.quality > bestQuality.score) {
          bestQuality = { score: result.metrics.quality, testId };
        }
        
        if (result.metrics.responseTime < fastestResponse.time) {
          fastestResponse = { time: result.metrics.responseTime, testId };
        }
        
        if (result.metrics.estimatedCost < mostCostEffective.cost) {
          mostCostEffective = { cost: result.metrics.estimatedCost, testId };
        }
      }
    });
    
    comparison.summary.bestQuality = bestQuality;
    comparison.summary.fastestResponse = fastestResponse;
    comparison.summary.mostCostEffective = mostCostEffective;
    
    return comparison;
  }

  getTestResults(promptId = null) {
    const results = Array.from(this.results.values());
    
    if (promptId) {
      return results.filter(result => {
        const test = this.tests.get(result.testId);
        return test && test.promptId === promptId;
      });
    }
    
    return results;
  }

  getTestHistory(limit = 50) {
    const results = this.getTestResults();
    return results
      .sort((a, b) => new Date(b.completedAt || b.failedAt) - new Date(a.completedAt || a.failedAt))
      .slice(0, limit);
  }

  deleteTest(testId) {
    const test = this.tests.get(testId);
    if (test) {
      this.tests.delete(testId);
      this.results.delete(testId);
      this.notifyListeners('testDeleted', test);
      return true;
    }
    return false;
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in testing listener:', error);
      }
    });
  }

  // Quick test method for frontend
  async runQuickTest(testData) {
    try {
      const { promptContent, variables = {} } = testData;
      
      // Replace variables in prompt content
      let processedContent = promptContent;
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}`, 'g');
        processedContent = processedContent.replace(regex, value);
      });
      
      // Generate mock response based on prompt content
      const mockResponse = await this.mockLLMCall(processedContent, { provider: 'openai', model: 'gpt-3.5-turbo' });
      
      // Evaluate the result
      const evaluation = this.evaluateResult(mockResponse, {
        promptContent: processedContent,
        testVariables: variables
      });
      
      const result = {
        testId: `quick-test-${Date.now()}`,
        promptContent: processedContent,
        variables,
        response: mockResponse,
        metrics: {
          responseTime: Math.floor(Math.random() * 2000) + 500, // 500-2500ms
          quality: evaluation.quality,
          length: mockResponse.length,
          estimatedCost: this.estimateCost(processedContent, mockResponse, { provider: 'openai', model: 'gpt-3.5-turbo' }),
          meetsRequirements: evaluation.meetsRequirements
        },
        evaluation: evaluation.details,
        completedAt: new Date().toISOString(),
        status: 'completed'
      };
      
      return result;
    } catch (error) {
      console.error('Error in quick test:', error);
      throw error;
    }
  }
}

// Create singleton instance
const promptTestingManager = new PromptTestingManager();

export default promptTestingManager;