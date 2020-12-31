--redis-cli --eval lua/compute.lua "Symbol-Epoch" "Symbol" , 30000 1 0.4
local symbolEpochKey = KEYS[1]
local symbolKey = KEYS[2]

 --Bar Window Time
local symbolTransactionTime = tonumber(ARGV[1]) --TransactionTime
local symbolPrice = tonumber(ARGV[2]) --Price
local symbolVolume = tonumber(ARGV[3]) --Volume

--Constants
local barWindow = 15000 --Bar Window In Milliseconds
local keySeperator ='-'
local expiryKeyMarker = 'E'
local firstPriceHashField ='F'
local highPriceHashField ='H'
local lowPriceHashField ='L'
local lastPriceHashField ='C'
local volumeHashField ='V'
local barNumberHashField ='B'

--Fetch Epoch Time
local symbolEpochTime = redis.call("GET",symbolEpochKey)
if (type(symbolEpochTime) == 'boolean' and symbolEpochTime == false) then 
    redis.call("SET",symbolEpochKey,symbolTransactionTime)
    symbolEpochTime = symbolTransactionTime
end

--Compute Bar Number
local barNumber = math.floor((symbolTransactionTime-symbolEpochTime)/barWindow)+1

--Compute Bar Keys
local symbolCurrentKey =  symbolKey .. keySeperator .. tostring(barNumber)
local symbolNotifyKey =  symbolKey .. keySeperator .. tostring(barNumber) .. keySeperator .. expiryKeyMarker

local existingData = redis.call("HGETALL",symbolCurrentKey)
local highPrice = symbolPrice
local lowPrice = symbolPrice
local firstEntryPrice = symbolPrice

if #existingData < 1 then 
    redis.call("PSETEX",symbolNotifyKey,barWindow,1)
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
return redis.call("HSET",symbolCurrentKey,firstPriceHashField,firstEntryPrice,lastPriceHashField,symbolPrice,highPriceHashField,highPrice,lowPriceHashField,lowPrice,volumeHashField,symbolVolume,barNumberHashField,barNumber)