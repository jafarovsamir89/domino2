-- Add configurable daily rewards schedule for the economy config.
ALTER TABLE "CoinEconomyConfig"
ADD COLUMN     "dailyRewards" INTEGER[] NOT NULL DEFAULT ARRAY[200, 300, 350, 400, 800, 1000, 2000]::INTEGER[];
