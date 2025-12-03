// Quick test script to verify logging is working
const API_URL = 'http://localhost:3001/api';

async function testLogging() {
  console.log('Testing request logging...\n');
  
  // Make a test request
  console.log('1. Making a test request to /api/config...');
  try {
    const response = await fetch(`${API_URL}/config`);
    const data = await response.json();
    console.log('   ✓ Request successful');
  } catch (error) {
    console.error('   ✗ Request failed:', error.message);
    return;
  }
  
  // Wait a moment for logging to complete
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check logs
  console.log('\n2. Checking logs endpoint...');
  try {
    const logsResponse = await fetch(`${API_URL}/logs?limit=5`);
    const logsData = await logsResponse.json();
    
    if (logsData.logs && logsData.logs.length > 0) {
      console.log(`   ✓ Found ${logsData.total} total logs`);
      console.log(`   ✓ Showing ${logsData.filtered} filtered logs`);
      console.log('\n   Recent logs:');
      logsData.logs.slice(0, 3).forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.method} ${log.path} - ${log.statusCode} (${log.duration}) ${log.isAgent ? '[AGENT]' : ''}`);
      });
    } else {
      console.log('   ⚠ No logs found yet. Make sure the server was restarted after adding logging.');
    }
  } catch (error) {
    console.error('   ✗ Failed to fetch logs:', error.message);
    console.log('   ⚠ Make sure the server is running and was restarted after adding logging.');
    return;
  }
  
  // Check stats
  console.log('\n3. Checking stats endpoint...');
  try {
    const statsResponse = await fetch(`${API_URL}/logs/stats`);
    const statsData = await statsResponse.json();
    console.log(`   ✓ Total requests: ${statsData.total}`);
    console.log(`   ✓ Agent requests: ${statsData.agentRequests}`);
    console.log(`   ✓ Regular requests: ${statsData.regularRequests}`);
    console.log(`   ✓ Agent percentage: ${statsData.agentPercentage}%`);
  } catch (error) {
    console.error('   ✗ Failed to fetch stats:', error.message);
  }
  
  console.log('\n✅ Logging test complete!');
  console.log('\nTo view logs in the admin panel:');
  console.log('   1. Go to http://localhost:3000/admin');
  console.log('   2. Scroll down to "Request Logs" section');
  console.log('   3. Click "Refresh" to see logs');
}

testLogging().catch(console.error);

