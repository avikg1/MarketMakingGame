import React, { useState, useEffect, useContext } from 'react';
import { Button, Input, Text, Box, Flex } from '@chakra-ui/react';
import SocketContext from "../../socket";
import PlayerResults from "./PlayerResults";

export default function Game({ userID }) {
  const [roundPrompt, setRoundPrompt] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [bidError, setBidError] = useState("");
  const [portfolio, setPortfolio] = useState({ cash: 100, calls: 0 });
  const [tradeMsg, setTradeMsg] = useState("");
  const [marketPrice, setMarketPrice] = useState(0); 
  const [sharpe, setSharpe] = useState(0);
  const [gameEnded, setGameEnded] = useState(false);
  const [results, setResults] = useState(null);
  const [bidSubmitted, setBidSubmitted] = useState(false);
  const [roundNumber, setRoundNumber] = useState(0);

  const socket = useContext(SocketContext);

  // Validate bid format: must be a number with at most one decimal place
  const validateBid = (value) => {
    // Empty input is valid (but won't submit)
    if (value === "") return "";
    
    // Check if it's a valid number format
    if (!/^-?\d*\.?\d*$/.test(value)) {
      return "Bid must be a number";
    }
    
    // If there's a decimal point, ensure there's only one digit after it
    if (value.includes('.') && value.split('.')[1].length > 1) {
      return "Bid can only have one decimal place";
    }
    
    return ""; // Empty string means valid
  };

  // Handle bid input change
  const handleBidChange = (e) => {
    const value = e.target.value;
    setBidPrice(value);
    
    // Validate as they type
    const error = validateBid(value);
    setBidError(error);
  };

  useEffect(() => {
    console.log("Game.js mounted for userID=", userID, "on socket.id=", socket.id);

    socket.on("newTradePrompt", ({ promptType, round }) => {
      console.log("CLIENT GOT newTradePrompt", promptType, round);
      let message = "";
      if (promptType === "sell-call") {
        message = "Computer is SELLING call at strike 110. Enter your BUY price.";
      } else {
        message = "Computer is BUYING call at strike 110. Enter your SELL price.";
      }
      setRoundPrompt(message);
      setRoundNumber(round);
      setBidSubmitted(false); // Reset bid submitted state for new round
      
      // Clear any previous trade messages after a delay
      setTimeout(() => {
        setTradeMsg("");
      }, 10000);
    });

    socket.on("tradeResults", (results) => {
      if (results[userID]) {
        const { price } = results[userID];
        setTradeMsg(`Your trade was executed at $${price}`);
      } else {
        setTradeMsg("No trade executed this round.");
      }
    });

    socket.on("positionsUpdated", (pos) => {
      if (pos[userID]) {
        setPortfolio(pos[userID]);

        if (pos[userID].marketPrice !== undefined) {
          setMarketPrice(pos[userID].marketPrice);
        }
        if (pos[userID].sharpe !== undefined) {
          setSharpe(pos[userID].sharpe);
        }
      }
    });

    socket.on("finalResults", (res) => {
      setResults(res);
      setGameEnded(true);
    });

    socket.on("gameOver", () => {
      setRoundPrompt("Game ended. Waiting for final results...");
      setGameEnded(true);
    });
    
    socket.on("returnToLobby", () => {
      console.log("Game ended, returning to lobby");
    });

    return () => {
      console.log("Game.js unmounting for socket.id=", socket.id);
      socket.off("newTradePrompt");
      socket.off("tradeResults");
      socket.off("positionsUpdated");
      socket.off("finalResults");
      socket.off("gameOver");
      socket.off("returnToLobby");
    };
  }, [userID, socket]);

  // Submit bid with validation
  const submitBid = () => {
    // Final validation before submission
    const error = validateBid(bidPrice);
    
    if (error || bidPrice === "") {
      setBidError(error || "Please enter a valid bid");
      return;
    }
    
    const px = parseFloat(bidPrice);
    if (!isNaN(px)) {
      socket.emit("submitBid", px, userID);
      setBidPrice("");
      setBidError("");
      setBidSubmitted(true); // Mark that the player has submitted a bid this round
      
      // Show confirmation message
      setTradeMsg(`Bid of $${px} submitted for round ${roundNumber}`);
    }
  };

  // If game has ended, show the results component
  if (gameEnded && results) {
    return <PlayerResults results={results} userID={userID} />;
  }

  // Otherwise show the game interface
  return (
    <Box p={6} maxW="600px" mx="auto" bg="gray.800" borderRadius="lg">
      {/* Current round's instructions */}
      <Box 
        p={4} 
        borderRadius="md" 
        bg="gray.700" 
        mb={6}
        boxShadow="sm"
      >
        <Text fontSize="xl" fontWeight="medium" color="white">
          {roundPrompt || "Waiting for the next round..."}
        </Text>
        {roundNumber > 0 && (
          <Text fontSize="sm" color="gray.300" mt={2}>
            Round {roundNumber}
          </Text>
        )}
      </Box>

      {/* Bid input */}
      <Flex direction="column" mb={6}>
        <Flex>
          <Input
            placeholder="Your bid price"
            value={bidPrice}
            onChange={handleBidChange}
            size="lg"
            mr={3}
            borderRadius="md"
            bg="gray.700"
            color="white"
            _placeholder={{ color: "gray.300" }}
            isInvalid={bidError !== ""}
            isDisabled={bidSubmitted}
          />
          <Button 
            onClick={submitBid} 
            colorScheme="blue" 
            size="lg"
            isDisabled={!roundPrompt || bidError !== "" || bidSubmitted}
          >
            Submit Bid
          </Button>
        </Flex>
        
        {/* Error or status message */}
        {bidError && !bidSubmitted && (
          <Text color="red.300" fontSize="sm" mt={2}>
            {bidError}
          </Text>
        )}
        {bidSubmitted && (
          <Text color="green.300" fontSize="sm" mt={2}>
            Bid submitted for this round
          </Text>
        )}
      </Flex>

      {/* Trade message */}
      {tradeMsg && (
        <Box 
          p={3} 
          mb={6} 
          bg="gray.700" 
          borderRadius="md"
          boxShadow="sm"
        >
          <Text fontSize="lg" fontWeight="medium" color="green.300">{tradeMsg}</Text>
        </Box>
      )}

      {/* Portfolio stats */}
      <Box 
        p={5} 
        border="1px solid" 
        borderColor="gray.600" 
        borderRadius="lg"
        boxShadow="md"
        bg="gray.700"
      >
        <Text fontWeight="bold" fontSize="xl" mb={4} color="white">Your Portfolio</Text>
        
        <Flex justify="space-between" wrap="wrap">
          <Box p={3} bg="gray.600" borderRadius="md" mb={3} flex="1" mr={3}>
            <Text color="gray.300">Cash</Text>
            <Text fontSize="2xl" fontWeight="bold" color="white">
              ${portfolio.cash.toFixed(2)}
            </Text>
          </Box>
          
          <Box p={3} bg="gray.600" borderRadius="md" mb={3} flex="1">
            <Text color="gray.300">Calls</Text>
            <Text fontSize="2xl" fontWeight="bold" color="white">
              {portfolio.calls}
            </Text>
          </Box>
          
          <Box p={3} bg="gray.600" borderRadius="md" mb={3} flex="1" mr={3}>
            <Text color="gray.300">Market Price</Text>
            <Text fontSize="2xl" fontWeight="bold" color="white">
              ${marketPrice.toFixed(2)}
            </Text>
          </Box>
          
          <Box p={3} bg="blue.700" borderRadius="md" mb={3} flex="1">
            <Text color="blue.200">Sharpe Ratio</Text>
            <Text fontSize="2xl" fontWeight="bold" color="white">
              {sharpe.toFixed(2)}
            </Text>
          </Box>
        </Flex>
        
        <Text fontSize="sm" color="gray.300" mt={4}>
          Remember: Higher Sharpe ratio means better risk-adjusted returns. Your goal is to maximize it!
        </Text>
      </Box>
    </Box>
  );
}