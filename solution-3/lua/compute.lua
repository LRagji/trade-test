--redis-cli --eval lua/compute.lua "Symbol" , 30000 1 0.4
local symbolKey = KEYS[1]

 --Bar Window Time
local symbolTransactionTime = tonumber(ARGV[1]) --TransactionTime
local symbolPrice = tonumber(ARGV[2]) --Price
local symbolVolume = tonumber(ARGV[3]) --Volume

--Constants
local barWindow = 15000 --Bar Window In Milliseconds
local pairHoldingKey = 'TEMP'
local updatesChannelName = 'ALLSYMB'
local skippedChannelName = 'SKIPPED'
local lastTimeKeySuffix = 'LAST'
local epochTimeKeySuffix = 'EPOCH'
local keySeperator ='-'
local firstPriceHashField ='F'
local highPriceHashField ='H'
local lowPriceHashField ='L'
local lastPriceHashField ='C'
local volumeHashField ='V'
local barNumberHashField ='B'


--Fetch OR Set Epoch Time for each symbol
local symbolEpochKey = symbolKey..keySeperator..epochTimeKeySuffix
local symbolEpochTime = redis.call("GET",symbolEpochKey)
if (type(symbolEpochTime) == 'boolean' and symbolEpochTime == false) then 
    redis.call("SET",symbolEpochKey,symbolTransactionTime)
    symbolEpochTime = symbolTransactionTime
end

--Fetch & Validate with latest timestamp
local lastTimeKey = symbolKey..keySeperator..lastTimeKeySuffix
local symbolLastTime = redis.call("GET",lastTimeKey)
if (type(symbolLastTime) == 'string' and tonumber(symbolLastTime) >= symbolTransactionTime) then 
  --Notify trade was skipped.
  local publishedMessage = tostring(symbolTransactionTime)..','..tostring(symbolPrice)..','..tostring(symbolVolume)..','..symbolLastTime
  return redis.call('PUBLISH',skippedChannelName,publishedMessage)
end
redis.call("SET",lastTimeKey,symbolTransactionTime)

--Compute Bar Number
local barWindowInNanoSeconds = barWindow * 1000 * 1000
local barNumber = math.floor((symbolTransactionTime-symbolEpochTime)/barWindowInNanoSeconds)+1

--Compute Bar Keys
local symbolCurrentKey =  symbolKey .. keySeperator .. tostring(barNumber)

local existingData = redis.call("HGETALL",symbolCurrentKey)
local highPrice = symbolPrice
local lowPrice = symbolPrice
local firstEntryPrice = symbolPrice

if #existingData < 1 then 
    redis.call('LPUSH',pairHoldingKey,symbolCurrentKey)
    local holdingLen = redis.call('LLEN',pairHoldingKey)
    if holdingLen == 2 then
        local smallKey = redis.call('RPOP',pairHoldingKey,symbolCurrentKey)
        local bigKey = redis.call('RPOP',pairHoldingKey,symbolCurrentKey)
        redis.call('XADD',updatesChannelName,'MAXLEN', '~', 10000,*,'S',smallKey,'B',bigKey)
        redis.call('DEL',pairHoldingKey)
    end
else
    for index = 1, #existingData,2
    do
       if existingData[index] == volumeHashField then
            symbolVolume = symbolVolume + tonumber(existingData[index+1])

        elseif  existingData[index] == firstPriceHashField then 
            firstEntryPrice = existingData[index+1]

        elseif  existingData[index] == highPriceHashField then 
            if tonumber(existingData[index+1]) > highPrice then  highPrice = tonumber(existingData[index+1]) end

        elseif  existingData[index] == lowPriceHashField then 
            if tonumber(existingData[index+1]) < lowPrice then  lowPrice = tonumber(existingData[index+1]) end
       end
    end
end

--Save data to key
redis.call("HSET",symbolCurrentKey,firstPriceHashField,firstEntryPrice,lastPriceHashField,symbolPrice,highPriceHashField,highPrice,lowPriceHashField,lowPrice,volumeHashField,symbolVolume,barNumberHashField,barNumber)
--Expire the key after a long timeout(3x) to GC Redis memory
return redis.call("PEXPIRE",symbolCurrentKey,barWindow*3)