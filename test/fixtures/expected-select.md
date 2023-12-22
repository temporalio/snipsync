Text above snippet

<!--SNIPSTART money-transfer-project-template-go-workflow {"selectedLines": ["1", "3-5"]}-->
[workflow.go](https://github.com/temporalio/money-transfer-project-template-go/blob/master/workflow.go)
```go
func MoneyTransfer(ctx workflow.Context, input PaymentDetails) (string, error) {
// ...
	// RetryPolicy specifies how to automatically handle retries if an Activity fails.
	retrypolicy := &temporal.RetryPolicy{
		InitialInterval:        time.Second,
```
<!--SNIPEND-->

Text below snippet
