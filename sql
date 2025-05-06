-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: srv1087.hstgr.io    Database: u367880334_hostelapp
-- ------------------------------------------------------
-- Server version	5.5.5-10.11.10-MariaDB

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
-- Table structure for table `projectEmployees`
--

DROP TABLE IF EXISTS `projectEmployees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projectEmployees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `projectId` int(11) DEFAULT NULL,
  `employeeId` int(11) DEFAULT NULL,
  `assignedAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `createdBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updatedBy` int(11) DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_projectEmployees_projectId` (`projectId`),
  KEY `fk_projectEmployees_employeeId` (`employeeId`),
  KEY `fk_projectEmployees_createdBy` (`createdBy`),
  KEY `fk_projectEmployees_deletedBy` (`deletedBy`),
  KEY `fk_projectEmployees_updatedBy` (`updatedBy`),
  CONSTRAINT `fk_projectEmployees_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projectEmployees_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projectEmployees_employeeId` FOREIGN KEY (`employeeId`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projectEmployees_projectId` FOREIGN KEY (`projectId`) REFERENCES `projects` (`projectId`),
  CONSTRAINT `fk_projectEmployees_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projectEmployees`
--

LOCK TABLES `projectEmployees` WRITE;
/*!40000 ALTER TABLE `projectEmployees` DISABLE KEYS */;
/*!40000 ALTER TABLE `projectEmployees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `projectId` int(11) NOT NULL AUTO_INCREMENT,
  `projectName` varchar(255) NOT NULL,
  `managerId` int(11) DEFAULT NULL,
  `clientName` varchar(255) NOT NULL,
  `startDate` date DEFAULT NULL,
  `endDate` date DEFAULT NULL,
  `status` enum('onGoing','completed','onHold','notStarted') DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `createdBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updatedBy` int(11) DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int(11) DEFAULT NULL,
  PRIMARY KEY (`projectId`),
  UNIQUE KEY `unq_projects_projectName` (`projectName`),
  KEY `fk_projects_managerId` (`managerId`),
  KEY `fk_projects_createdBy` (`createdBy`),
  KEY `fk_projects_updatedBy` (`updatedBy`),
  KEY `fk_projects_deletedBy` (`deletedBy`),
  CONSTRAINT `fk_projects_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projects_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projects_managerId` FOREIGN KEY (`managerId`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projects_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `timesheets`
--

DROP TABLE IF EXISTS `timesheets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timesheets` (
  `timesheetId` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) DEFAULT NULL,
  `projectId` int(11) DEFAULT NULL,
  `task` text DEFAULT NULL,
  `documentImage` varchar(255) DEFAULT NULL,
  `hoursWorked` int(11) NOT NULL,
  `workDate` date NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`timesheetId`),
  KEY `fk_timesheets_userId` (`userId`),
  KEY `fk_timesheets_projectId` (`projectId`),
  CONSTRAINT `fk_timesheets_projectId` FOREIGN KEY (`projectId`) REFERENCES `projects` (`projectId`),
  CONSTRAINT `fk_timesheets_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `timesheets`
--

LOCK TABLES `timesheets` WRITE;
/*!40000 ALTER TABLE `timesheets` DISABLE KEYS */;
/*!40000 ALTER TABLE `timesheets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `userId` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `emailId` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('admin','manager','hr','employee') DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `createdBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updatedBy` int(11) DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int(11) DEFAULT NULL,
  `otp` varchar(255) DEFAULT NULL,
  `otpAttempt` int(11) DEFAULT NULL,
  `otpTiming` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `unq_users_emailId` (`emailId`),
  KEY `fk_users_createdBy` (`createdBy`),
  KEY `fk_users_updatedBy` (`updatedBy`),
  KEY `fk_users_deletedBy` (`deletedBy`),
  CONSTRAINT `fk_users_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_users_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_users_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (3,'jeeva','2003-10-31','jeeva37710@gmail.com','123123','employee',NULL,NULL,'2025-03-10 05:22:28',NULL,'2025-03-20 07:33:41',NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-03-22 12:49:52

























-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: srv1087.hstgr.io    Database: u367880334_hostelapp
-- ------------------------------------------------------
-- Server version	5.5.5-10.11.10-MariaDB

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
-- Table structure for table `projectEmployees`
--

DROP TABLE IF EXISTS `projectEmployees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projectEmployees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `projectId` int(11) DEFAULT NULL,
  `employeeId` int(11) DEFAULT NULL,
  `assignedAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `createdBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updatedBy` int(11) DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_projectEmployees_projectId` (`projectId`),
  KEY `fk_projectEmployees_employeeId` (`employeeId`),
  KEY `fk_projectEmployees_createdBy` (`createdBy`),
  KEY `fk_projectEmployees_deletedBy` (`deletedBy`),
  KEY `fk_projectEmployees_updatedBy` (`updatedBy`),
  CONSTRAINT `fk_projectEmployees_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projectEmployees_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projectEmployees_employeeId` FOREIGN KEY (`employeeId`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projectEmployees_projectId` FOREIGN KEY (`projectId`) REFERENCES `projects` (`projectId`),
  CONSTRAINT `fk_projectEmployees_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projectEmployees`
--

LOCK TABLES `projectEmployees` WRITE;
/*!40000 ALTER TABLE `projectEmployees` DISABLE KEYS */;
/*!40000 ALTER TABLE `projectEmployees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `projectId` int(11) NOT NULL AUTO_INCREMENT,
  `projectName` varchar(255) NOT NULL,
  `managerId` int(11) DEFAULT NULL,
  `clientName` varchar(255) NOT NULL,
  `startDate` date DEFAULT NULL,
  `endDate` date DEFAULT NULL,
  `status` enum('active','completed','pending','notStarted') DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `createdBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updatedBy` int(11) DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int(11) DEFAULT NULL,
  PRIMARY KEY (`projectId`),
  UNIQUE KEY `unq_projects_projectName` (`projectName`),
  KEY `fk_projects_managerId` (`managerId`),
  KEY `fk_projects_createdBy` (`createdBy`),
  KEY `fk_projects_updatedBy` (`updatedBy`),
  KEY `fk_projects_deletedBy` (`deletedBy`),
  CONSTRAINT `fk_projects_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projects_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projects_managerId` FOREIGN KEY (`managerId`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_projects_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `timesheets`
--



ALTER TABLE projects
ADD CONSTRAINT unq_projects_clientName UNIQUE (clientName);



DROP TABLE IF EXISTS `timesheets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timesheets` (
  `timesheetId` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) DEFAULT NULL,
  `projectId` int(11) DEFAULT NULL,
  `task` text DEFAULT NULL,
  `documentImage` varchar(255) DEFAULT NULL,
  `hoursWorked` DECIMAL(3,2) NULL,
  `workDate` date NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`timesheetId`),
  KEY `fk_timesheets_userId` (`userId`),
  KEY `fk_timesheets_projectId` (`projectId`),
  CONSTRAINT `fk_timesheets_projectId` FOREIGN KEY (`projectId`) REFERENCES `projects` (`projectId`),
  CONSTRAINT `fk_timesheets_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `timesheets`
--

LOCK TABLES `timesheets` WRITE;
/*!40000 ALTER TABLE `timesheets` DISABLE KEYS */;
/*!40000 ALTER TABLE `timesheets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--



ALTER TABLE `timesheets`
ADD COLUMN `updatedBy` int DEFAULT NULL,
ADD CONSTRAINT `fk_timesheets_updatedBy`
FOREIGN KEY (`updatedBy`) REFERENCES `users`(`userId`);

ALTER TABLE timesheets
ADD COLUMN updatedAt TIMESTAMP null DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;








DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `userId` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `emailId` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('admin','manager','hr','employee') DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `createdBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updatedBy` int(11) DEFAULT NULL,
  `deletedAt` timestamp NULL DEFAULT NULL,
  `deletedBy` int(11) DEFAULT NULL,
  `otp` varchar(255) DEFAULT NULL,
  `otpAttempt` int(11) DEFAULT NULL,
  `otpTiming` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `unq_users_emailId` (`emailId`),
  KEY `fk_users_createdBy` (`createdBy`),
  KEY `fk_users_updatedBy` (`updatedBy`),
  KEY `fk_users_deletedBy` (`deletedBy`),
  CONSTRAINT `fk_users_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_users_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `fk_users_updatedBy` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (3,'jeeva','2003-10-31','jeeva37710@gmail.com','123123','employee',NULL,NULL,'2025-03-10 05:22:28',NULL,'2025-03-20 07:33:41',NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-03-22 12:49:52

drop table projectHistorys
create table projectHistorys (
	 historyId int NOT NULL AUTO_INCREMENT,
     projectId int null,
     action enum('created', 'edited', 'deleted'),
     changes text,
     createdAt timestamp NOT NULL DEFAULT current_timestamp(),
  createdBy int(11) DEFAULT NULL,
  updatedAt timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  updatedBy int(11) DEFAULT NULL,
  deletedAt timestamp NULL DEFAULT NULL,
  deletedBy int(11) DEFAULT NULL,
  PRIMARY KEY (historyId),
CONSTRAINT fk_projectHistorys_projectId FOREIGN KEY (projectId) REFERENCES projects (projectId),
  CONSTRAINT fk_projectHistorys_createdBy FOREIGN KEY (createdBy) REFERENCES users (userId),
  CONSTRAINT fk_projectHistorys_deletedBy FOREIGN KEY (deletedBy) REFERENCES users (userId),
  CONSTRAINT fk_projectHistorys_updatedBy FOREIGN KEY (updatedBy) REFERENCES users (userId)
     
)


create table timesheetHistorys (
	timesheetHistoryId int not null auto_increment,
    timesheetId int,
    changes text,
    createdAt timestamp NOT NULL DEFAULT current_timestamp(),
    createdBy int,
	PRIMARY KEY (timesheetHistoryId),
	CONSTRAINT fk_timesheetHistorys_timesheetId FOREIGN KEY (timesheetId) REFERENCES timesheets (timesheetId),
    CONSTRAINT fk_timesheetHistorys_createdBy FOREIGN KEY (createdBy) REFERENCES users (userId)
)