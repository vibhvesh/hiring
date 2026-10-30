// Canonical technology name -> spoken/written aliases (lowercase).
export const TECH: Record<string, string[]> = {
  React: ['react', 'reactjs', 'react.js', 'react js'],
  'Next.js': ['next.js', 'nextjs', 'next js'],
  Angular: ['angular', 'angularjs'],
  Vue: ['vue', 'vue.js', 'vuejs'],
  JavaScript: ['javascript', 'java script', 'js', 'es6'],
  TypeScript: ['typescript', 'type script', 'ts'],
  'HTML/CSS': ['html', 'css', 'html5', 'css3', 'tailwind', 'sass'],
  'Node.js': ['node', 'nodejs', 'node.js', 'node js', 'express', 'nestjs'],
  Java: ['java', 'core java', 'j2ee'],
  Spring: ['spring', 'spring boot', 'springboot', 'hibernate'],
  Python: ['python', 'python3'],
  Django: ['django'],
  FastAPI: ['fastapi', 'fast api', 'flask'],
  Pandas: ['pandas', 'numpy'],
  'Machine Learning': ['machine learning', 'ml', 'scikit-learn', 'sklearn', 'tensorflow', 'pytorch', 'deep learning'],
  Spark: ['spark', 'pyspark', 'databricks', 'hadoop'],
  SQL: ['sql', 'mysql', 'postgres', 'postgresql', 'oracle', 'sql server', 'pl/sql', 'mssql'],
  MongoDB: ['mongodb', 'mongo', 'nosql', 'dynamodb', 'cassandra'],
  Redis: ['redis'],
  Kafka: ['kafka', 'rabbitmq'],
  Microservices: ['microservices', 'micro services', 'microservice'],
  'REST APIs': ['rest api', 'rest apis', 'restful', 'api', 'apis', 'graphql'],
  AWS: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  Azure: ['azure'],
  GCP: ['gcp', 'google cloud'],
  Docker: ['docker', 'containers'],
  Kubernetes: ['kubernetes', 'k8s', 'eks', 'aks', 'helm'],
  Terraform: ['terraform', 'ansible', 'infrastructure as code', 'cloudformation'],
  'CI/CD': ['ci/cd', 'ci cd', 'cicd', 'jenkins', 'github actions', 'gitlab ci', 'pipelines', 'pipeline'],
  Linux: ['linux', 'bash', 'shell scripting', 'unix'],
  'C#/.NET': ['c#', 'c sharp', '.net', 'dotnet', 'dot net', 'asp.net', 'asp.net core', '.net core', 'entity framework'],
  Kotlin: ['kotlin', 'jetpack compose'],
  Android: ['android'],
  'iOS/Swift': ['ios', 'swift', 'swiftui'],
  Selenium: ['selenium', 'webdriver'],
  'Test Automation': ['test automation', 'automation testing', 'cypress', 'playwright', 'appium', 'testng', 'junit', 'pytest', 'jest'],
  'Manual Testing': ['manual testing', 'test cases', 'regression testing', 'jira'],
  Go: ['golang', 'go lang'],
  'System Design': ['system design', 'architecture', 'distributed systems', 'scalability'],
  Git: ['git', 'github', 'gitlab', 'bitbucket'],
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/#]/g, '\\$&')
const MATCHERS = Object.entries(TECH).map(([name, aliases]) => ({
  name,
  re: new RegExp(`(^|[^a-z0-9+#.])(${aliases.map(escape).join('|')})(?![a-z0-9+#])`, 'i'),
}))

/** All technologies mentioned in text, in order of first mention. */
export function findTech(text: string): string[] {
  const t = ' ' + text.toLowerCase().replace(/\s+/g, ' ').replace(/\b(react|node|vue|next|nest)[ .]js\b/g, '$1js') + ' '
  return MATCHERS.map((m) => ({ name: m.name, at: t.search(m.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.name)
}

/** Map a free-form technology name (from a profile) to its canonical name. */
export function canonicalTech(name: string): string {
  const found = findTech(name)
  return found[0] ?? name.trim()
}
