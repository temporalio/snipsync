Text above snippet

<!--SNIPSTART typescript-hello-workflow {"startPattern" : "const \\{ greet", "endPattern": "\\}\\)"} -->
[hello-world/src/workflows.ts](https://github.com/temporalio/samples-typescript/blob/main/hello-world/src/workflows.ts)
```ts
const { greet } = proxyActivities<typeof activities>({
startToCloseTimeout: '1 minute',
})
```
<!--SNIPEND-->

<!--SNIPSTART money-transfer-project-template-go-workflow {"startPattern": "retrypolicy :=", "endPattern": "?}"} -->
[workflow.go](https://github.com/temporalio/money-transfer-project-template-go/blob/main/workflow.go)
```go
retrypolicy := &temporal.RetryPolicy{
		InitialInterval:        time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        100 * time.Second,
		MaximumAttempts:        0, // unlimited retries
		NonRetryableErrorTypes: []string{"InvalidAccountError", "InsufficientFundsError"}
```
<!--SNIPEND-->

Text below snippet
