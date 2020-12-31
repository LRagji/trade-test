Assumptions:
1. Updates to any existing trades will not be supported.
2. Out of time sync trades is not supported, every transaction will have a timestamp greater than previous.
3. Blank windows can exists but are not nessecary to be computed, correct bar number should be set for the window before and after the gap.(If really necessary publishers can do gap filling by generating empty bar windows)
4. Aggregation of volume is done by Summation operator.
5. Assuming a distrubuted ser

## Solution-1:

NPM already has such packages build, so test and try to use one of them if they fit the creteria
1. OLHC https://www.npmjs.com/package/ohlc
2. OLHC-AGG https://www.npmjs.com/package/ohlc-aggregator

**Design Characteristics:**
1. Dont reinvent the wheel (We dont have to invest time)
2. Running out of support and finally we may need to maintin it.

**I assume such packages cannot be used for the test so this solution is not practical for test purpose. but for a product lifecycle its worth a short expirement.**

## Solution-2:

It divides the problem into threee discreet steps:
1. Reader.js : This peice of code reads and parses the json file, which is then pushed to next step.
2. Redis : This is the state machine (more like central memory) which has the logic for processing each trade. Output is a bar computed for each 15sec window on a pub-sub channel
3. Listner.js : This is guy who listnes to output from the Redis and pushes it to websocket or console.

**Performance**
Tested on Mac Pro Mojave 16GB 2.2GHz Intel i7 with Node 12.18.3 runtime, Redis as docker, Test file of 21MB of trades

1. Process 1.5k trades per second.
2. Redis Peak memory 28MB, Reader:50MB, Listner:50MB
3. Combined average CPU utilization 20~40%

**Design Characteristics:**
1. Lua manages floats differently then how other languages do EG: 0.6 will be read as 0.59999999999999998 in lua. This problem can be easily fixed by settting the decimal precision and rounding it to those number of digits.
2. Since this approach is based on Key expiry to notify the listner of the 15 sec window there can be instances when key expiry notification takes longer than expected this is how Redis operates but will change in future Ref links: https://redis.io/topics/notifications. To mitigate this problem a simple key scan at given intervals will fix this.
3. Uses a lot of timers (key expiry) which seems to be resource intensive.
4. Because of point number 2 output bars can come out of sync i.e: 5th bar first compared to 4th bar(if this is not acceptable we should look at solution 3).


