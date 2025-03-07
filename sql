-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: timesheet
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `project`
--

DROP TABLE IF EXISTS `project`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project` (
  `projectId` int NOT NULL AUTO_INCREMENT,
  `projectName` varchar(255) NOT NULL,
  `managerId` int DEFAULT NULL,
  `clientName` varchar(255) NOT NULL,
  `employeeId` int DEFAULT NULL,
  `startDate` date DEFAULT NULL,
  `endDate` date DEFAULT NULL,
  `status` enum('onGoing','completed','onHold','notStarted') DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` int DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` int DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int DEFAULT NULL,
  PRIMARY KEY (`projectId`),
  UNIQUE KEY `unq_project_projectName` (`projectName`),
  KEY `fk_project_managerId` (`managerId`),
  KEY `fk_project_employeeId` (`employeeId`),
  KEY `fk_project_createdBy` (`createdBy`),
  KEY `fk_project_updatedBy` (`updatedBy`),
  KEY `fk_project_deletedBy` (`deletedBy`),
  CONSTRAINT `fk_project_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `user` (`userId`),
  CONSTRAINT `fk_project_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `user` (`userId`),
  CONSTRAINT `fk_project_employeeId` FOREIGN KEY (`employeeId`) REFERENCES `user` (`userId`),
  CONSTRAINT `fk_project_managerId` FOREIGN KEY (`managerId`) REFERENCES `user` (`userId`),
  CONSTRAINT `fk_project_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `user` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timesheet`
--

DROP TABLE IF EXISTS `timesheet`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timesheet` (
  `timesheetId` int NOT NULL AUTO_INCREMENT,
  `userId` int DEFAULT NULL,
  `projectId` int DEFAULT NULL,
  `task` text,
  `hoursWorked` int NOT NULL,
  `workDate` date NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`timesheetId`),
  KEY `fk_timesheet_userId` (`userId`),
  KEY `fk_timesheet_projectId` (`projectId`),
  CONSTRAINT `fk_timesheet_projectId` FOREIGN KEY (`projectId`) REFERENCES `project` (`projectId`),
  CONSTRAINT `fk_timesheet_userId` FOREIGN KEY (`userId`) REFERENCES `user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `userId` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `emailId` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('admin','manager','hr','employee') DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` int DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` int DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int DEFAULT NULL,
  `otp` varchar(255) DEFAULT NULL,
  `otpAttempt` int DEFAULT NULL,
  `otpTiming` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `unq_user_emailId` (`emailId`),
  KEY `fk_user_createdBy` (`createdBy`),
  KEY `fk_user_updatedBy` (`updatedBy`),
  KEY `fk_user_deletedBy` (`deletedBy`),
  CONSTRAINT `fk_user_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `user` (`userId`),
  CONSTRAINT `fk_user_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `user` (`userId`),
  CONSTRAINT `fk_user_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `user` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-03-07 14:28:05
