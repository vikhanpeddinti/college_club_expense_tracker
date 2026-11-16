import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const APPROVER_2_PRIVATE_KEY = process.env.APPROVER_2_PRIVATE_KEY;

function formatPrivateKey(key) {
  if (!key) return null;
  const clean = key.trim();
  if (clean.startsWith("0x") && clean.length === 66) return clean;
  if (clean.length === 64) return `0x${clean}`;
  return null;
}

const accounts = [];
const primaryKey = formatPrivateKey(SEPOLIA_PRIVATE_KEY);
if (primaryKey) accounts.push(primaryKey);
const secondaryKey = formatPrivateKey(APPROVER_2_PRIVATE_KEY);
if (secondaryKey) accounts.push(secondaryKey);

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: accounts,
      chainId: 11155111,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
