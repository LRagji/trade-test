# Trade-Test

This repo is a node based solution for the trade-test.

## Instrction to run the repo:
1. Git clone this repo.
2. Run `NPM Install` to download dependencies.
3. Run `docker run redis:latest` to run redis instance on local machine.
4. Run `NPM run listner` This starts the listner for real time trade updates. Outputs for each symbol are written at `\test\output\` folder.
5. Run `NPM run reader` This starts the reader which reads input trade file at `\test\input\trades.json`

## Solution Design:
1. Design takes a simple route and uses redis as the central memmory store to aggregate trades into bar data structure.
2. It is real time design with debouncing, this means a trade input will generate an equivalent bar data structure at the output after the configured debouncing time in listner.
3. Design is horizontal scallable which means you can have multiple readers and listners active.
4. Design uses Sorted set, Streams, KVP data structure in redis server.

## Performance 
Tested on Mac Pro Mojave 16GB 2.2GHz Intel i7 with Node 12.18.3 runtime, Redis as docker, Test file of 21MB of trades

1. Process ~2.9k avg trades per second.
2. Redis Peak memory 28MB, Reader:150MB, Listner:200MB
3. Combined average CPU utilization 40~70% (Redis,Reader and Listner)
4. Design supports Redis sharding for further performance gains.

## Solution Code:
1. Reader `solution-4/reader.js` responsible to read, parse and push trade data to redis server.
2. Listner `solution-4/listner.js` responsible to collect bar data after every trade transaction and sink data to WS or Console or File.

## Design Characteristics:
1. Updates to any existing trades not supported.
2. Out of time sync trades not supported, every transaction will have a timestamp greater than previous for a given symbol.
3. Blank windows can exists but are not nessecary to be computed, correct bar number should be set for the window before and after the gap.(If really necessary consumers can do gap filling by generating empty bar windows)
4. Aggregation of volume is done by Summation operator.
5. Design assumes a distrubuted setup.

<hr/>

## Another Solution:

NPM already has such packages build, so test and try to use one of them if they fit the creteria
1. OLHC https://www.npmjs.com/package/ohlc
2. OLHC-AGG https://www.npmjs.com/package/ohlc-aggregator

## Design Characteristics:
1. Dont reinvent the wheel (We dont have to invest time)
2. Running out of support and finally we may need to maintin it.

**I assume such packages cannot be used for the test so this solution is not practical for test purpose. but for a product lifecycle its worth a short expirement.**