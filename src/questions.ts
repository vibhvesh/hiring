import type { Difficulty } from './config.ts'
import type { Seniority } from './extract.ts'
import { canonicalTech } from './tech.ts'

export interface TechQuestion {
  tech: string
  level: 1 | 2 | 3
  text: string
  keywords: string[]
  gap?: boolean
}

// "question | keyword, keyword" — three levels per technology: basic, working, deep.
const BANK: Record<string, [string[], string[], string[]]> = {
  React: [
    ['What is the difference between state and props in React? | state, props, parent, child, re-render, immutable'],
    ['When would you use useEffect, and what is its dependency array for? | side effect, dependency, cleanup, render, fetch, unmount'],
    ['A React page re-renders too often and feels slow. How do you find and fix the cause? | profiler, memo, usememo, usecallback, key, state, context, virtualization'],
  ],
  'Next.js': [
    ['What does Next.js add on top of plain React? | routing, server, ssr, static, seo, api'],
    ['When would you choose server-side rendering over static generation? | ssr, static, cache, seo, dynamic, revalidate'],
    ['How do you decide what runs on the server versus the client in a Next.js app? | server component, client, bundle, hydration, cache, secret'],
  ],
  Angular: [
    ['What is a component and what is a service in Angular? | component, service, inject, template, reuse'],
    ['How do observables from RxJS fit into an Angular app? | observable, subscribe, async pipe, unsubscribe, operator, stream'],
    ['How would you improve change detection performance in a large Angular app? | onpush, zone, trackby, signal, detach, lazy'],
  ],
  Vue: [
    ['What is the difference between computed properties and methods in Vue? | computed, cache, reactive, method, dependency'],
    ['How do components share state in a Vue app? | props, emit, pinia, vuex, store, provide'],
    ['How does Vue reactivity work under the hood? | proxy, dependency, track, trigger, ref, reactive'],
  ],
  JavaScript: [
    ['What is the difference between let, const and var? | scope, block, hoisting, reassign, function'],
    ['Explain promises and async/await. How do you handle errors? | promise, async, await, try, catch, reject, then'],
    ['Explain the event loop and how a long task can freeze a page. | call stack, queue, microtask, macrotask, worker, block'],
  ],
  TypeScript: [
    ['Why would a team choose TypeScript over plain JavaScript? | type, compile, error, autocomplete, refactor, safety'],
    ['What is the difference between an interface and a type alias, and what are generics for? | interface, type, generic, reuse, union, extend'],
    ['How do you type an API response you cannot fully trust? | unknown, validation, zod, narrow, guard, runtime'],
  ],
  'HTML/CSS': [
    ['How do you make a layout work on both phone and desktop? | media query, flexbox, grid, responsive, viewport, mobile first'],
    ['What is the difference between flexbox and grid? | flexbox, grid, one dimension, two dimension, row, column'],
    ['How do you make a web page accessible to screen reader users? | semantic, aria, label, contrast, keyboard, alt'],
  ],
  'Node.js': [
    ['What is Node.js good at, and why is it single-threaded? | event loop, non-blocking, io, async, thread'],
    ['How do you structure error handling and logging in a Node API? | middleware, try, catch, status, log, error'],
    ['A Node service has high latency under load. How do you investigate? | profile, event loop, blocking, cluster, cache, database, metrics'],
  ],
  Java: [
    ['What is the difference between an abstract class and an interface in Java? | abstract, interface, implement, extend, default, multiple'],
    ['How does a HashMap work internally? | hash, bucket, equals, hashcode, collision, tree'],
    ['How do you find and fix a memory leak or high GC pauses in a Java service? | heap, dump, gc, profiler, reference, leak, jvm'],
  ],
  Spring: [
    ['What is dependency injection, and how does Spring Boot use it? | bean, inject, autowired, container, constructor'],
    ['How do you handle transactions in Spring? | transactional, rollback, commit, propagation, isolation'],
    ['How would you make a Spring Boot service resilient to a slow downstream service? | timeout, retry, circuit breaker, fallback, resilience4j, bulkhead'],
  ],
  Python: [
    ['What is the difference between a list, a tuple and a dictionary in Python? | list, tuple, dictionary, mutable, key, immutable'],
    ['What are decorators and generators, and when have you used them? | decorator, generator, yield, wrap, lazy, memory'],
    ['How do you speed up a slow Python job that processes a lot of data? | profile, vectorize, multiprocessing, gil, async, batch, cache'],
  ],
  Django: [
    ['How does a request flow through a Django app? | url, view, model, template, middleware'],
    ['How do you avoid the N plus one query problem in Django? | select_related, prefetch, query, orm, join'],
    ['How would you scale a Django app that is getting slow? | cache, index, celery, queue, database, profile'],
  ],
  FastAPI: [
    ['Why would you choose FastAPI or Flask for a service? | lightweight, async, api, pydantic, route'],
    ['How do you validate request data in a Python API? | pydantic, schema, validation, type, error'],
    ['How do you handle background work and long requests in a Python API? | celery, queue, background, worker, async, timeout'],
  ],
  Pandas: [
    ['How do you handle missing values in a pandas DataFrame? | fillna, dropna, missing, null, impute'],
    ['What is the difference between merge, join and concat in pandas? | merge, join, concat, key, axis'],
    ['Your pandas job runs out of memory. What do you do? | chunk, dtype, category, dask, spark, vectorize'],
  ],
  'Machine Learning': [
    ['What is overfitting and how do you prevent it? | overfitting, validation, regularization, more data, cross validation, dropout'],
    ['How do you choose a metric for an imbalanced classification problem? | precision, recall, f1, auc, imbalance, threshold'],
    ['How do you monitor a model after it goes to production? | drift, monitoring, retrain, metric, data quality, feedback'],
  ],
  Spark: [
    ['What is the difference between a transformation and an action in Spark? | lazy, transformation, action, dag, collect'],
    ['What causes a shuffle in Spark and why does it matter? | shuffle, partition, join, groupby, network'],
    ['How do you fix data skew in a big Spark join? | skew, salting, broadcast, partition, repartition'],
  ],
  SQL: [
    ['What is the difference between an inner join and a left join? | inner, left, match, null, rows'],
    ['What is an index, and when can an index hurt? | index, lookup, write, slow, b-tree, scan'],
    ['A query got slow after the table grew. How do you fix it? | explain, plan, index, partition, query, statistics'],
  ],
  MongoDB: [
    ['When would you choose a document database over a relational one? | schema, flexible, document, join, scale'],
    ['How do you design indexes in MongoDB? | index, compound, query, explain, field'],
    ['How do you handle consistency and transactions in a NoSQL system? | consistency, transaction, eventual, replica, write concern'],
  ],
  Redis: [
    ['What do teams typically use Redis for? | cache, session, queue, fast, memory'],
    ['How do you keep a cache in sync with the database? | invalidation, ttl, write through, cache aside, stale'],
    ['How do you avoid a cache stampede? | lock, jitter, ttl, stampede, refresh, early'],
  ],
  Kafka: [
    ['What is Kafka and when would you use it? | topic, producer, consumer, event, stream, queue'],
    ['How do partitions and consumer groups work in Kafka? | partition, consumer group, offset, order, parallel'],
    ['How do you get exactly-once or idempotent processing with Kafka? | idempotent, offset, commit, duplicate, transaction, retry'],
  ],
  Microservices: [
    ['What are the pros and cons of microservices compared with a monolith? | independent, deploy, scale, complexity, network'],
    ['How do microservices talk to each other, and how do you handle failures? | rest, queue, event, retry, timeout, circuit breaker'],
    ['How do you keep data consistent across microservices? | saga, outbox, eventual, event, compensate, idempotent'],
  ],
  'REST APIs': [
    ['What makes an API RESTful? Which HTTP methods do you use for what? | get, post, put, delete, resource, status'],
    ['How do you version and document an API? | version, openapi, swagger, backward, deprecate'],
    ['How do you secure a public API? | auth, token, oauth, rate limit, https, validation'],
  ],
  AWS: [
    ['Which AWS services have you used, and what for? | ec2, s3, lambda, rds, iam, vpc'],
    ['How do you design IAM permissions for a team? | least privilege, role, policy, group, mfa'],
    ['How would you design a highly available service on AWS? | multi az, load balancer, autoscaling, backup, region, health check'],
  ],
  Azure: [
    ['Which Azure services have you worked with? | app service, functions, storage, vm, aks, devops'],
    ['How do you manage secrets and identities in Azure? | key vault, managed identity, rbac, entra'],
    ['How do you design for high availability on Azure? | availability zone, region, load balancer, backup, scale'],
  ],
  GCP: [
    ['Which Google Cloud services have you used? | compute, gke, bigquery, cloud run, storage'],
    ['How do you control access in GCP? | iam, service account, role, least privilege'],
    ['How would you design a reliable data pipeline on GCP? | pubsub, dataflow, bigquery, retry, monitoring'],
  ],
  Docker: [
    ['What is the difference between a Docker image and a container? | image, container, layer, run, instance'],
    ['How do you keep Docker images small and secure? | multi-stage, slim, alpine, layer, scan, non-root'],
    ['How do you debug a container that keeps crashing in production? | logs, exit code, health check, exec, resource, memory'],
  ],
  Kubernetes: [
    ['What is a pod, a deployment and a service in Kubernetes? | pod, deployment, service, replica, container'],
    ['How do you do a zero-downtime rollout in Kubernetes? | rolling update, readiness probe, liveness, rollback, replicas'],
    ['A pod is stuck in CrashLoopBackOff. Walk me through your steps. | logs, describe, events, probe, resource, oom, config'],
  ],
  Terraform: [
    ['What problem does infrastructure as code solve? | repeatable, version, review, drift, automation'],
    ['What is Terraform state and how do you manage it in a team? | state, remote, backend, lock, s3'],
    ['How do you structure Terraform for many environments safely? | module, workspace, environment, plan, review, variables'],
  ],
  'CI/CD': [
    ['What does a typical CI/CD pipeline you built look like? | build, test, deploy, stage, artifact'],
    ['How do you make deployments safe? | test, staging, canary, blue green, rollback, approval'],
    ['How do you speed up a slow pipeline? | cache, parallel, incremental, artifact, matrix'],
  ],
  Linux: [
    ['How do you check what is using CPU or memory on a Linux server? | top, htop, ps, free, memory, cpu'],
    ['How do you troubleshoot a server running out of disk space? | df, du, logs, rotate, inode'],
    ['A server is slow but CPU looks fine. What else do you check? | io, iostat, network, memory, swap, load'],
  ],
  'C#/.NET': [
    ['What is the difference between a class and a struct in C#? | class, struct, reference, value, heap, stack'],
    ['How does async and await work in .NET? | task, async, await, thread, deadlock, configureawait'],
    ['How do you find a performance problem in an ASP.NET Core service? | profiler, logging, metrics, database, allocation, cache'],
  ],
  Kotlin: [
    ['What do you like about Kotlin compared with Java? | null safety, concise, data class, extension, coroutine'],
    ['How do coroutines work and how do you cancel them? | coroutine, scope, suspend, cancel, dispatcher'],
    ['How do you avoid memory leaks with coroutines and lifecycles? | viewmodelscope, lifecycle, cancel, scope, leak'],
  ],
  Android: [
    ['Explain the Android activity lifecycle. | oncreate, onstart, onresume, onpause, onstop, ondestroy'],
    ['How do you structure an Android app? | mvvm, viewmodel, repository, livedata, flow, compose'],
    ['How do you make an Android app fast and stable on low-end phones? | memory, leak, background, profiler, anr, battery'],
  ],
  'iOS/Swift': [
    ['What is the difference between a struct and a class in Swift? | struct, class, value, reference, copy'],
    ['How do you avoid retain cycles in Swift? | weak, unowned, closure, retain, arc'],
    ['How do you keep an iOS app responsive while loading data? | main thread, async, background, concurrency, cache'],
  ],
  Selenium: [
    ['What are locators in Selenium, and which do you prefer? | id, xpath, css, locator, stable'],
    ['How do you handle waits and flaky tests in Selenium? | explicit wait, implicit, flaky, retry, sync'],
    ['How do you design a test framework that scales? | page object, data driven, parallel, report, ci'],
  ],
  'Test Automation': [
    ['What would you automate first, and what would you keep manual? | regression, repetitive, smoke, exploratory, roi'],
    ['How do you keep automated tests reliable? | flaky, wait, isolation, data, mock, retry'],
    ['How do you fit automated tests into a CI pipeline? | ci, parallel, report, gate, stage, fast'],
  ],
  'Manual Testing': [
    ['What is the difference between a test case and a test scenario? | test case, scenario, steps, expected, high level'],
    ['How do you write a good bug report? | steps, expected, actual, severity, screenshot, environment'],
    ['How do you decide what to test when time is short? | risk, priority, critical, regression, impact'],
  ],
  Go: [
    ['What do you like about Go for backend services? | simple, fast, concurrency, goroutine, compile'],
    ['How do goroutines and channels work? | goroutine, channel, select, buffer, sync'],
    ['How do you avoid goroutine leaks? | context, cancel, timeout, close, waitgroup'],
  ],
  'System Design': [
    ['How would you design a URL shortener at a high level? | database, hash, cache, redirect, scale'],
    ['How do you decide between SQL and NoSQL for a new system? | consistency, schema, scale, query, transaction'],
    ['How would you design a system to handle ten times today\'s traffic? | scale, cache, queue, shard, load balancer, bottleneck'],
  ],
  Git: [
    ['What is the difference between merge and rebase? | merge, rebase, history, commit, conflict'],
    ['How does your team use branches and pull requests? | branch, pull request, review, main, feature'],
    ['How do you recover from a bad commit that already reached main? | revert, reset, cherry-pick, hotfix'],
  ],
}

const GENERIC: [string[], string[], string[]] = [
  ['Tell me about a recent task you finished. What was your part? | task, built, tested, team, delivered'],
  ['Describe a technical problem you solved recently, step by step. | problem, debug, root cause, fix, test'],
  ['Tell me about a design decision you made and the trade-offs. | trade-off, option, decision, scale, cost, risk'],
]

function parse(tech: string, level: 1 | 2 | 3, line: string, gap = false): TechQuestion {
  const [text, kw] = line.split('|')
  return { tech, level, text: text.trim(), keywords: (kw ?? '').split(',').map((k) => k.trim()).filter(Boolean), gap }
}

export const hasBank = (tech: string) => tech in BANK

const SEN: Record<Seniority, number> = { Fresher: 0, Junior: 0, 'Mid-level': 1, Senior: 2, Lead: 2 }
const SHIFT: Record<Difficulty, number> = { Easy: -1, Medium: 0, Hard: 1, Tough: 1 }
export const TECH_COUNT: Record<Difficulty, number> = { Easy: 3, Medium: 4, Hard: 4, Tough: 5 }

export function levelFor(s: Seniority, d: Difficulty): 1 | 2 | 3 {
  return (Math.max(0, Math.min(2, SEN[s] + SHIFT[d])) + 1) as 1 | 2 | 3
}

/**
 * Pick technical questions: the candidate's confirmed stack first (skills the role
 * needs come first), then up to two questions on required skills they did not mention.
 */
export function selectQuestions(stack: string[], required: string[], s: Seniority, d: Difficulty): TechQuestion[] {
  const level = levelFor(s, d)
  const req = required.map(canonicalTech)
  const known = stack.filter(hasBank)
  const ordered = [...known.filter((t) => req.includes(t)), ...known.filter((t) => !req.includes(t))]
  const gaps = req.filter((t) => hasBank(t) && !stack.includes(t))
  const total = TECH_COUNT[d]
  const gapCount = Math.min(gaps.length, d === 'Easy' ? 1 : 2, Math.max(0, total - 1))
  const out: TechQuestion[] = []
  const own = ordered.length ? ordered : req.filter(hasBank)
  const passLevels: (1 | 2 | 3)[] = [level, ...([1, 2, 3] as const).filter((x) => x !== level).sort((a, b) => Math.abs(a - level) - Math.abs(b - level) || b - a)]
  for (const l of passLevels) {
    for (const t of own) {
      if (out.length >= total - gapCount) break
      out.push(parse(t, l, BANK[t][l - 1][0]))
    }
  }
  for (const t of gaps.slice(0, gapCount)) {
    const q = parse(t, 1, BANK[t][0][0], true)
    out.push({ ...q, text: `This role also uses ${t}, which you didn't mention. ${q.text} It's fine to say if you haven't used it.` })
  }
  for (let l: number = level; out.length < total; l = l === 3 ? 1 : l + 1) {
    const q = parse('General', l as 1 | 2 | 3, GENERIC[l - 1][0])
    if (out.some((o) => o.text === q.text)) break
    out.push(q)
  }
  return out
}
