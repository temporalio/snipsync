<!--SNIPSTART typescript-ejson-worker -->
[ejson/src/worker.ts](https://github.com/temporalio/samples-typescript/blob/main/ejson/src/worker.ts)
```ts
const worker = await Worker.create({
  workflowsPath: require.resolve('./workflows'),
  taskQueue: 'ejson',
  dataConverter: { payloadConverterPath: require.resolve('./payload-converter') },
});
```
<!--SNIPEND-->
