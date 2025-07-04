const { discoverAgents } = require('./apps/server/dist/services/agent-discovery.js');

async function testGeminiDetection() {
    console.log('🧪 Testing Gemini CLI detection...');
    
    try {
        const agents = await discoverAgents({
            enableRealAgents: true,
            enableMockAgents: false,
            mixedMode: false
        });
        
        console.log(`Found ${agents.length} agents total`);
        
        const geminiAgent = agents.find(agent => agent.type === 'gemini-code-assist' || agent.id === 'gemini-cli');
        
        if (geminiAgent) {
            console.log('✅ Gemini CLI detected successfully!');
            console.log('Agent details:', {
                id: geminiAgent.id,
                name: geminiAgent.name,
                type: geminiAgent.type,
                logPaths: geminiAgent.logPaths,
                pathCount: geminiAgent.metadata?.pathCount
            });
        } else {
            console.log('❌ Gemini CLI not detected');
            console.log('Available agents:', agents.map(a => ({ id: a.id, name: a.name, type: a.type })));
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testGeminiDetection(); 