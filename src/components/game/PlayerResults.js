import React from 'react';
import {
  Box,
  Heading,
  Text,
  Flex,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Badge,
  Divider,
  Stack
} from '@chakra-ui/react';

const PlayerResults = ({ results, userID }) => {
  // If no results or user not found
  if (!results || !results[userID]) {
    return (
      <Box textAlign="center" p={5} bg="white" color="black" borderRadius="lg">
        <Heading size="md">Waiting for final results...</Heading>
      </Box>
    );
  }
  
  // Get current player data
  const playerData = results[userID];
  const pnl = playerData.finalCash - 100; // Assuming starting cash was 100
  
  // Get all player data sorted by Sharpe ratio
  const sortedPlayers = Object.entries(results).sort((a, b) => 
    b[1].sharpe - a[1].sharpe
  );
  
  // Find player rank
  const playerRank = sortedPlayers.findIndex(([id]) => id === userID) + 1;
  
  return (
    <Box 
      maxW="600px" 
      mx="auto" 
      p={6} 
      borderWidth="1px" 
      borderRadius="lg" 
      boxShadow="xl"
      bg="white"
      color="black"
    >
      <Heading size="xl" textAlign="center" mb={4} color="black">Game Results</Heading>
      
      <Flex 
        direction="column" 
        align="center" 
        bg="blue.50" 
        p={4} 
        borderRadius="md"
        mb={6}
      >
        <Text fontSize="lg" color="black">You finished</Text>
        <Heading size="2xl" color="blue.600">
          {playerRank === 1 ? '🏆 1st Place!' : 
           playerRank === 2 ? '🥈 2nd Place!' :
           playerRank === 3 ? '🥉 3rd Place!' :
           `${playerRank}${playerRank === 1 ? 'st' : playerRank === 2 ? 'nd' : playerRank === 3 ? 'rd' : 'th'} Place`}
        </Heading>
        <Text mt={2} color="black">out of {sortedPlayers.length} players</Text>
      </Flex>
      
      <Divider my={4} />
      
      <Stack spacing={6}>
        <Flex justify="space-between">
          <Stat>
            <StatLabel color="black">Final Cash</StatLabel>
            <StatNumber color="black">${playerData.finalCash.toFixed(2)}</StatNumber>
            <StatHelpText color={pnl >= 0 ? "green.600" : "red.600"}>
              <StatArrow type={pnl >= 0 ? 'increase' : 'decrease'} />
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
            </StatHelpText>
          </Stat>
          
          <Stat>
            <StatLabel color="black">Sharpe Ratio</StatLabel>
            <StatNumber color="black">{playerData.sharpe.toFixed(2)}</StatNumber>
            <StatHelpText color="black">
              Risk-adjusted return
            </StatHelpText>
          </Stat>
          
          <Stat>
            <StatLabel color="black">Final Position</StatLabel>
            <StatNumber color="black">{playerData.calls} calls</StatNumber>
            <StatHelpText color="black">
              Strike price: $100
            </StatHelpText>
          </Stat>
        </Flex>
        
        <Divider />
        
        <Box>
          <Heading size="sm" mb={3} color="black">Top Performers</Heading>
          {sortedPlayers.slice(0, 3).map(([id, data], index) => (
            <Flex 
              key={id}
              justify="space-between" 
              p={2}
              borderRadius="md"
              bg={id === userID ? "yellow.100" : "transparent"}
              mb={1}
            >
              <Flex align="center">
                <Badge 
                  colorScheme={index === 0 ? "yellow" : index === 1 ? "gray" : "orange"}
                  mr={2}
                >
                  {index + 1}
                </Badge>
                <Text fontWeight={id === userID ? "bold" : "normal"} color="black">
                  {data.username} {id === userID ? "(You)" : ""}
                </Text>
              </Flex>
              <Text fontWeight="semibold" color="black">
                {data.sharpe.toFixed(2)}
              </Text>
            </Flex>
          ))}
        </Box>
      </Stack>
      
      <Text fontSize="sm" color="gray.600" textAlign="center" mt={6}>
        Waiting for the admin to return everyone to the lobby...
      </Text>
    </Box>
  );
};

export default PlayerResults;