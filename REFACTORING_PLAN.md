# Directory Refactoring Plan

## Overview
This document outlines a comprehensive refactoring plan to reorganize the codebase for better maintainability, scalability, and clear separation of concerns.

## Current Issues
1. **Platform-specific code scattered** across multiple directories
2. **Business logic layers are mixed** without clear boundaries
3. **Configuration files dispersed** throughout various modules
4. **Utility functions duplicated** across different packages
5. **Unclear separation** between API layer, service layer, and data access layer

## Target Directory Structure

```
lib/
├── services/                 # Business service layer
│   ├── download/
│   │   ├── download.service.ts
│   │   ├── metadata.service.ts
│   │   └── index.ts
│   ├── media/
│   │   ├── media.service.ts
│   │   ├── processing.service.ts
│   │   └── index.ts
│   ├── ai/
│   │   ├── translation.service.ts
│   │   ├── transcription.service.ts
│   │   └── index.ts
│   └── index.ts
├── providers/                # External service providers
│   ├── youtube/
│   │   ├── provider.ts
│   │   ├── downloader.ts
│   │   ├── metadata.ts
│   │   └── index.ts
│   ├── tiktok/
│   │   ├── provider.ts
│   │   ├── downloader.ts
│   │   ├── metadata.ts
│   │   └── index.ts
│   └── index.ts
├── repositories/             # Data access layer
│   ├── media.repository.ts
│   ├── download.repository.ts
│   └── index.ts
├── utils/                    # Utility functions
│   ├── file/
│   │   ├── file-utils.ts
│   │   └── index.ts
│   ├── time/
│   │   ├── time-utils.ts
│   │   └── index.ts
│   ├── format/
│   │   ├── format.ts
│   │   └── index.ts
│   ├── validation/
│   │   ├── url-validator.ts
│   │   └── index.ts
│   └── index.ts
├── types/                    # Type definitions
│   ├── media.types.ts
│   ├── download.types.ts
│   ├── provider.types.ts
│   └── index.ts
├── config/                   # Configuration files
│   ├── app.config.ts
│   ├── download.config.ts
│   ├── ai.config.ts
│   └── index.ts
├── constants/                # Constants
│   ├── media.constants.ts
│   ├── app.constants.ts
│   └── index.ts
└── index.ts
```

## Refactoring Steps

### Phase 1: Analysis and Preparation
1. **Code Analysis**
   - Map all current dependencies
   - Identify circular dependencies
   - Document current file purposes

2. **Create New Structure**
   - Set up new directory structure
   - Create barrel export files

### Phase 2: Service Layer Refactoring
1. **Download Service**
   - Extract business logic from `orpc/procedures/download.ts`
   - Create `lib/services/download/download.service.ts`
   - Implement proper error handling and logging

2. **Media Service**
   - Consolidate media-related operations
   - Create `lib/services/media/media.service.ts`

3. **AI Service**
   - Organize AI-related operations
   - Create `lib/services/ai/` services

### Phase 3: Provider Layer Refactoring
1. **Reorganize Platform Providers**
   - Move YouTube-specific code to `lib/providers/youtube/`
   - Move TikTok-specific code to `lib/providers/tiktok/`
   - Standardize provider interfaces

2. **Create Provider Abstractions**
   - Define common provider interfaces
   - Implement provider factory pattern

### Phase 4: Utility and Configuration Refactoring
1. **Reorganize Utilities**
   - Group utils by functionality
   - Remove duplicates
   - Create comprehensive test coverage

2. **Centralize Configuration**
   - Move all configs to `lib/config/`
   - Create environment-specific configs

### Phase 5: Integration and Testing
1. **Update All Imports**
   - Refactor all import statements
   - Ensure no broken references

2. **Testing and Validation**
   - Run full test suite
   - Manual testing of critical paths
   - Performance validation

## Migration Strategy

### Risk Mitigation
- **Incremental migration**: Move one module at a time
- **Backward compatibility**: Keep old files during transition
- **Comprehensive testing**: Test each migration step
- **Rollback plan**: Maintain ability to revert changes

### Timeline Estimate
- **Phase 1**: 1-2 days (Analysis and setup)
- **Phase 2**: 3-4 days (Service layer)
- **Phase 3**: 2-3 days (Provider layer)
- **Phase 4**: 2 days (Utilities and config)
- **Phase 5**: 2-3 days (Integration and testing)

**Total Estimated Time**: 10-14 days

## Success Criteria
1. ✅ All tests pass after refactoring
2. ✅ No circular dependencies
3. ✅ Clear separation of concerns
4. ✅ Improved code discoverability
5. ✅ No performance degradation
6. ✅ Documentation updated

## Next Steps
1. Review and approve this plan
2. Set up tracking document
3. Begin Phase 1 execution