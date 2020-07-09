/**
 * Copyright 2013-2020 the original author or authors from the JHipster project.
 *
 * This file is part of the JHipster project, see https://www.jhipster.tech/
 * for more information.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable consistent-return */
const chalk = require('chalk');
const _ = require('lodash');
const pluralize = require('pluralize');
const path = require('path');
const prompts = require('./prompts');
const BaseBlueprintGenerator = require('../generator-base-blueprint');
const constants = require('../generator-constants');
const statistics = require('../statistics');
const { isReservedClassName, isReservedTableName } = require('../../jdl/jhipster/reserved-keywords');
const { entityDefaultConfig } = require('../generator-defaults');

/* constants used throughout */
const SUPPORTED_VALIDATION_RULES = constants.SUPPORTED_VALIDATION_RULES;
const ANGULAR = constants.SUPPORTED_CLIENT_FRAMEWORKS.ANGULAR;
const JHIPSTER_CONFIG_DIR = constants.JHIPSTER_CONFIG_DIR;

const stringify = data => JSON.stringify(data, null, 4);

let useBlueprints;

class EntityGenerator extends BaseBlueprintGenerator {
    constructor(args, opts) {
        super(args, opts);

        // This makes `name` a required argument.
        this.argument('name', {
            type: String,
            required: true,
            description: 'Entity name',
        });

        // This adds support for a `--from-cli` flag
        this.option('from-cli', {
            desc: 'Indicates the command is run from JHipster CLI',
            type: Boolean,
            defaults: false,
        });

        // This method adds support for a `--[no-]regenerate` flag
        this.option('regenerate', {
            desc: 'Regenerate the entity without presenting an option to update it',
            type: Boolean,
            defaults: false,
        });

        this.option('table-name', {
            desc: 'Specify table name that will be used by the entity',
            type: String,
        });

        // This method adds support for a `--[no-]fluent-methods` flag
        this.option('fluent-methods', {
            desc: 'Generate fluent methods in entity beans to allow chained object construction',
            type: Boolean,
        });

        // This adds support for a `--angular-suffix` flag
        this.option('angular-suffix', {
            desc: 'Use a suffix to generate Angular routes and files, to avoid name clashes',
            type: String,
        });

        // This adds support for a `--client-root-folder` flag
        this.option('client-root-folder', {
            desc:
                'Use a root folder name for entities on client side. By default its empty for monoliths and name of the microservice for gateways',
            type: String,
        });

        // This adds support for a `--skip-ui-grouping` flag
        this.option('skip-ui-grouping', {
            desc: 'Disables the UI grouping behaviour for entity client side code',
            type: Boolean,
        });

        // This adds support for a `--skip-server` flag
        this.option('skip-server', {
            desc: 'Skip the server-side code generation',
            type: Boolean,
            defaults: false,
        });

        // This adds support for a `--skip-client` flag
        this.option('skip-client', {
            desc: 'Skip the client-side code generation',
            type: Boolean,
            defaults: false,
        });

        // This adds support for a `--skip-db-changelog` flag
        this.option('skip-db-changelog', {
            desc: 'Skip the generation of database changelog (liquibase for sql databases)',
            type: Boolean,
            defaults: false,
        });

        // This adds support for a `--db` flag
        this.option('db', {
            desc: 'Provide DB option for the application when using skip-server flag',
            type: String,
        });

        // This adds support for a `--experimental` flag which can be used to enable experimental features
        this.option('experimental', {
            desc:
                'Enable experimental features. Please note that these features may be unstable and may undergo breaking changes at any time',
            type: Boolean,
            defaults: false,
        });

        if (this.options.help) {
            return;
        }

        const name = _.upperFirst(this.options.name).replace('.json', '');
        this.context = { name };
        this.entityStorage = this.getEntityConfig(name);
        this.entityConfig = this.entityStorage.createProxy();

        this._setupEntityOptions(this, this, this.context);
        this.registerPrettierTransform();

        useBlueprints = !this.fromBlueprint && this.instantiateBlueprints('entity', { arguments: [name] });
    }

    // Public API method used by the getter and also by Blueprints
    _initializing() {
        return {
            validateFromCli() {
                this.checkInvocationFromCLI();
            },
            loadSharedConfig() {
                // Load configuration into this.context
                this.loadAppConfig(undefined, this.context);
                this.loadClientConfig(undefined, this.context);
                this.loadServerConfig(undefined, this.context);
                this.loadTranslationConfig(undefined, this.context);
            },
            loadOptions() {
                const context = this.context;
                context.options = this.options;

                if (this.options.db) {
                    context.databaseType = this.getDBTypeFromDBValue(this.options.db);
                    context.prodDatabaseType = this.options.db;
                    context.devDatabaseType = this.options.db;
                }

                context.skipServer = context.skipServer || this.options.skipServer;
                context.skipDbChangelog = context.skipDbChangelog || this.options.skipDbChangelog;
                context.skipClient = context.skipClient || this.options.skipClient;
            },
            loadEntitySpecificOptions() {
                const fileData = this.context.fileData || {};
                this.context.skipClient = this.context.skipClient || fileData.skipClient;
            },
            setupSharedConfig() {
                const context = this.context;

                context.protractorTests = context.testFrameworks.includes('protractor');
                context.gatlingTests = context.testFrameworks.includes('gatling');
                context.cucumberTests = context.testFrameworks.includes('cucumber');

                context.jhiPrefixDashed = _.kebabCase(context.jhiPrefix);
                context.jhiTablePrefix = this.getTableName(context.jhiPrefix);
                context.capitalizedBaseName = _.upperFirst(context.baseName);

                context.angularAppName = this.getAngularAppName(context.baseName);
                context.angularXAppName = this.getAngularXAppName(context.baseName);
                context.mainClass = this.getMainClassName(context.baseName);
                context.microserviceAppName = '';

                if (context.applicationType === 'microservice') {
                    context.skipClient = true;
                    context.microserviceName = context.baseName;
                    if (!context.clientRootFolder) {
                        context.clientRootFolder = context.microserviceName;
                    }
                }

                if (context.entitySuffix === context.dtoSuffix) {
                    this.error('The entity cannot be generated as the entity suffix and DTO suffix are equals !');
                }
            },

            validateReactiveCompatibility() {
                if (this.context.reactive && !['mongodb', 'cassandra', 'couchbase', 'neo4j'].includes(this.context.databaseType)) {
                    this.error(
                        `The entity generator doesn't support reactive apps with databases of type ${this.context.databaseType} at the moment`
                    );
                }
            },

            validateEntityName() {
                const validation = this._validateEntityName(this.context.name);
                if (validation !== true) {
                    this.error(validation);
                }
            },

            fileName() {
                // filename field is used by askForMicroserviceJson
                this.context.filename = path.join(JHIPSTER_CONFIG_DIR, `${_.upperFirst(this.context.name)}.json`);
            },

            /* Use need microservice path to load the entity file */
            askForMicroserviceJson: prompts.askForMicroserviceJson,

            setupMicroServiceEntity() {
                const context = this.context;
                context.useMicroserviceJson = !!context.microservicePath;
                if (context.useMicroserviceJson) {
                    context.microserviceFileName = this.destinationPath(context.microservicePath, context.filename);
                    context.useConfigurationFile = true;
                }
            },

            setupEntityConfig() {
                const context = this.context;
                const entityName = context.name;
                context.filename = this.destinationPath(context.filename);
                context.configurationFileExists = this.fs.exists(context.filename);
                context.useConfigurationFile = context.configurationFileExists || context.useConfigurationFile;
                if (context.configurationFileExists) {
                    this.log(chalk.green(`\nFound the ${context.filename} configuration file, entity can be automatically generated!\n`));
                }

                _.defaults(context, {
                    haveFieldWithJavadoc: false,
                    // enum-specific consts
                    enums: [],

                    existingEnum: false,

                    fieldNamesUnderscored: ['id'],
                    // these variable hold field and relationship names for question options during update
                    fieldNameChoices: [],
                    relNameChoices: [],
                });

                // Specific Entity sub-generator constants
                if (!context.useConfigurationFile) {
                    // no file present, new entity creation
                    this.log(`\nThe entity ${entityName} is being created.\n`);
                } else {
                    // existing entity reading values from file
                    this.log(`\nThe entity ${entityName} is being updated.\n`);
                    this._loadEntityJson(context.microserviceFileName || context.filename);
                }
                _.defaults(context, entityDefaultConfig);
            },

            validateTableName() {
                const validation = this._validateTableName(this.context.entityTableName);
                if (validation !== true) {
                    this.error(validation);
                }
            },
        };
    }

    get initializing() {
        if (useBlueprints) return;
        return this._initializing();
    }

    // Public API method used by the getter and also by Blueprints
    _prompting() {
        return {
            /* ask question to user if s/he wants to update entity */
            askForUpdate: prompts.askForUpdate,
            askForFields: prompts.askForFields,
            askForFieldsToRemove: prompts.askForFieldsToRemove,
            askForRelationships: prompts.askForRelationships,
            askForRelationsToRemove: prompts.askForRelationsToRemove,
            askForTableName: prompts.askForTableName,
            askForService: prompts.askForService,
            askForDTO: prompts.askForDTO,
            askForFiltering: prompts.askForFiltering,
            askForReadOnly: prompts.askForReadOnly,
            askForPagination: prompts.askForPagination,
        };
    }

    get prompting() {
        if (useBlueprints) return;
        return this._prompting();
    }

    // Public API method used by the getter and also by Blueprints
    _configuring() {
        return {
            validateFile() {
                const context = this.context;
                const entityName = context.name;
                // Validate entity json field content
                context.fields.forEach(field => {
                    if (_.isUndefined(field.fieldName)) {
                        this.error(`fieldName is missing in .jhipster/${entityName}.json for field ${stringify(field)}`);
                    }

                    if (_.isUndefined(field.fieldType)) {
                        this.error(`fieldType is missing in .jhipster/${entityName}.json for field ${stringify(field)}`);
                    }

                    if (!_.isUndefined(field.fieldValidateRules)) {
                        if (!_.isArray(field.fieldValidateRules)) {
                            this.error(`fieldValidateRules is not an array in .jhipster/${entityName}.json for field ${stringify(field)}`);
                        }
                        field.fieldValidateRules.forEach(fieldValidateRule => {
                            if (!_.includes(SUPPORTED_VALIDATION_RULES, fieldValidateRule)) {
                                this.error(
                                    `fieldValidateRules contains unknown validation rule ${fieldValidateRule} in .jhipster/${entityName}.json for field ${stringify(
                                        field
                                    )} [supported validation rules ${SUPPORTED_VALIDATION_RULES}]`
                                );
                            }
                        });
                        if (_.includes(field.fieldValidateRules, 'max') && _.isUndefined(field.fieldValidateRulesMax)) {
                            this.error(`fieldValidateRulesMax is missing in .jhipster/${entityName}.json for field ${stringify(field)}`);
                        }
                        if (_.includes(field.fieldValidateRules, 'min') && _.isUndefined(field.fieldValidateRulesMin)) {
                            this.error(`fieldValidateRulesMin is missing in .jhipster/${entityName}.json for field ${stringify(field)}`);
                        }
                        if (_.includes(field.fieldValidateRules, 'maxlength') && _.isUndefined(field.fieldValidateRulesMaxlength)) {
                            this.error(
                                `fieldValidateRulesMaxlength is missing in .jhipster/${entityName}.json for field ${stringify(field)}`
                            );
                        }
                        if (_.includes(field.fieldValidateRules, 'minlength') && _.isUndefined(field.fieldValidateRulesMinlength)) {
                            this.error(
                                `fieldValidateRulesMinlength is missing in .jhipster/${entityName}.json for field ${stringify(field)}`
                            );
                        }
                        if (_.includes(field.fieldValidateRules, 'maxbytes') && _.isUndefined(field.fieldValidateRulesMaxbytes)) {
                            this.error(
                                `fieldValidateRulesMaxbytes is missing in .jhipster/${entityName}.json for field ${stringify(field)}`
                            );
                        }
                        if (_.includes(field.fieldValidateRules, 'minbytes') && _.isUndefined(field.fieldValidateRulesMinbytes)) {
                            this.error(
                                `fieldValidateRulesMinbytes is missing in .jhipster/${entityName}.json for field ${stringify(field)}`
                            );
                        }
                        if (_.includes(field.fieldValidateRules, 'pattern') && _.isUndefined(field.fieldValidateRulesPattern)) {
                            this.error(
                                `fieldValidateRulesPattern is missing in .jhipster/${entityName}.json for field ${stringify(field)}`
                            );
                        }
                        if (field.fieldType === 'ByteBuffer') {
                            this.warning(
                                `Cannot use validation in .jhipster/${entityName}.json for field ${stringify(
                                    field
                                )} \nHibernate JPA 2 Metamodel does not work with Bean Validation 2 for LOB fields, so LOB validation is disabled`
                            );
                            field.validation = false;
                            field.fieldValidateRules = [];
                        }
                    }
                });

                // Validate entity json relationship content
                context.relationships.forEach(relationship => {
                    if (_.isUndefined(relationship.relationshipName)) {
                        relationship.relationshipName = relationship.otherEntityName;
                        this.warning(
                            `relationshipName is missing in .jhipster/${entityName}.json for relationship ${stringify(
                                relationship
                            )}, using ${relationship.otherEntityName} as fallback`
                        );
                    }

                    if (_.isUndefined(relationship.otherEntityName)) {
                        this.error(
                            `otherEntityName is missing in .jhipster/${entityName}.json for relationship ${stringify(relationship)}`
                        );
                    }

                    if (
                        _.isUndefined(relationship.otherEntityRelationshipName) &&
                        _.isUndefined(relationship.relationshipType) === false &&
                        relationship.relationshipType !== ''
                    ) {
                        relationship.otherEntityRelationshipName = _.lowerFirst(entityName);
                        if (relationship.otherEntityName !== 'user') {
                            this.warning(
                                `otherEntityRelationshipName is missing in .jhipster/${entityName}.json for relationship ${stringify(
                                    relationship
                                )}, using ${_.lowerFirst(entityName)} as fallback`
                            );
                        }
                    }

                    if (
                        _.isUndefined(relationship.otherEntityField) &&
                        (relationship.relationshipType === 'many-to-one' ||
                            (relationship.relationshipType === 'many-to-many' && relationship.ownerSide === true) ||
                            (relationship.relationshipType === 'one-to-one' && relationship.ownerSide === true))
                    ) {
                        this.warning(
                            `otherEntityField is missing in .jhipster/${entityName}.json for relationship ${stringify(
                                relationship
                            )}, using id as fallback`
                        );
                        relationship.otherEntityField = 'id';
                    }

                    if (_.isUndefined(relationship.relationshipType)) {
                        this.error(
                            `relationshipType is missing in .jhipster/${entityName}.json for relationship ${stringify(relationship)}`
                        );
                    }

                    if (
                        _.isUndefined(relationship.ownerSide) &&
                        (relationship.relationshipType === 'one-to-one' || relationship.relationshipType === 'many-to-many')
                    ) {
                        this.error(`ownerSide is missing in .jhipster/${entityName}.json for relationship ${stringify(relationship)}`);
                    }
                });

                // Validate root entity json content
                if (_.isUndefined(context.changelogDate) && ['sql', 'cassandra'].includes(context.databaseType)) {
                    const currentDate = this.dateFormatForLiquibase();
                    this.warning(`changelogDate is missing in .jhipster/${entityName}.json, using ${currentDate} as fallback`);
                    context.changelogDate = currentDate;
                }
                if (_.isUndefined(context.dto)) {
                    this.warning(`dto is missing in .jhipster/${entityName}.json, using no as fallback`);
                    context.dto = 'no';
                }
                if (_.isUndefined(context.service)) {
                    this.warning(`service is missing in .jhipster/${entityName}.json, using no as fallback`);
                    context.service = 'no';
                }
                if (_.isUndefined(context.jpaMetamodelFiltering)) {
                    this.warning(`jpaMetamodelFiltering is missing in .jhipster/${entityName}.json, using 'no' as fallback`);
                    context.jpaMetamodelFiltering = false;
                }
                if (_.isUndefined(context.pagination)) {
                    this.warning(`pagination is missing in .jhipster/${entityName}.json, using no as fallback`);
                    context.pagination = 'no';
                }
                if (!context.clientRootFolder && !context.skipUiGrouping) {
                    // if it is a gateway generating from a microservice, or a microservice
                    if (context.useMicroserviceJson || context.applicationType === 'microservice') {
                        context.clientRootFolder = context.microserviceName;
                    }
                }
            },

            writeEntityJson() {
                const context = this.context;
                if (context.configurationFileExists && context.updateEntity === 'regenerate') {
                    return; // do not update if regenerating entity
                }
                // store information in a file for further use.
                if (_.isUndefined(context.changelogDate) && ['sql', 'cassandra', 'couchbase'].includes(context.databaseType)) {
                    context.changelogDate = this.dateFormatForLiquibase();
                }

                // Keep existing config by cloning fileData
                const storageData = this.context.fileData ? { ...this.context.fileData } : {};
                storageData.fluentMethods = context.fluentMethods;
                storageData.clientRootFolder = context.clientRootFolder;
                storageData.relationships = context.relationships;
                storageData.fields = context.fields;
                storageData.changelogDate = context.changelogDate;
                storageData.dto = context.dto;
                storageData.searchEngine = context.searchEngine;
                storageData.service = context.service;
                storageData.entityTableName = context.entityTableName;
                storageData.databaseType = context.databaseType;
                storageData.readOnly = context.readOnly;
                this._copyFilteringFlag(context, storageData, context);
                if (['sql', 'mongodb', 'couchbase', 'neo4j'].includes(context.databaseType)) {
                    storageData.pagination = context.pagination;
                } else {
                    storageData.pagination = 'no';
                }
                storageData.javadoc = context.javadoc;
                if (context.entityAngularJSSuffix) {
                    storageData.angularJSSuffix = context.entityAngularJSSuffix;
                }
                if (context.applicationType === 'microservice' || context.applicationType === 'uaa') {
                    storageData.microserviceName = context.baseName;
                }
                if (context.applicationType === 'gateway' && context.useMicroserviceJson) {
                    storageData.microserviceName = context.microserviceName;
                }

                if (this.storageData) {
                    // Override storageData configs with existing this.storageData
                    // So that blueprints can create it and override fields.
                    this.storageData = { ...storageData, ...this.storageData };
                } else {
                    this.storageData = storageData;
                }

                this.entityStorage.set(this.storageData);
                this.data = this.storageData;
            },

            loadInMemoryData() {
                const context = this.context;
                const entityName = context.name;
                const entityNamePluralizedAndSpinalCased = _.kebabCase(pluralize(entityName));

                context.entityClass = context.entityNameCapitalized;
                context.entityClassPlural = pluralize(context.entityClass);

                const fileData = this.data || this.context.fileData || {};
                // Used for i18n
                context.entityClassHumanized = fileData.entityClassHumanized || _.startCase(context.entityNameCapitalized);
                context.entityClassPluralHumanized = fileData.entityClassPluralHumanized || _.startCase(context.entityClassPlural);
                // Implement i18n variant ex: 'male', 'female' when applied
                context.entityI18nVariant = fileData.entityI18nVariant || 'default';

                context.entityInstance = _.lowerFirst(entityName);
                context.entityInstancePlural = pluralize(context.entityInstance);
                context.entityApiUrl = entityNamePluralizedAndSpinalCased;
                context.entityFileName = _.kebabCase(context.entityNameCapitalized + _.upperFirst(context.entityAngularJSSuffix));
                context.entityFolderName = this.getEntityFolderName(context.clientRootFolder, context.entityFileName);
                context.entityModelFileName = context.entityFolderName;
                context.entityParentPathAddition = this.getEntityParentPathAddition(context.clientRootFolder);
                context.entityPluralFileName = entityNamePluralizedAndSpinalCased + context.entityAngularJSSuffix;
                context.entityServiceFileName = context.entityFileName;
                context.entityAngularName = context.entityClass + this.upperFirstCamelCase(context.entityAngularJSSuffix);
                context.entityReactName = context.entityClass + this.upperFirstCamelCase(context.entityAngularJSSuffix);
                context.entityStateName = _.kebabCase(context.entityAngularName);
                context.entityUrl = context.entityStateName;
                context.entityTranslationKey = context.clientRootFolder
                    ? _.camelCase(`${context.clientRootFolder}-${context.entityInstance}`)
                    : context.entityInstance;
                context.entityTranslationKeyMenu = _.camelCase(
                    context.clientRootFolder ? `${context.clientRootFolder}-${context.entityStateName}` : context.entityStateName
                );
                context.jhiTablePrefix = this.getTableName(context.jhiPrefix);
                context.reactiveRepositories =
                    context.reactive && ['mongodb', 'cassandra', 'couchbase', 'neo4j'].includes(context.databaseType);

                context.fieldsContainDate = false;
                context.fieldsContainInstant = false;
                context.fieldsContainUUID = false;
                context.fieldsContainZonedDateTime = false;
                context.fieldsContainDuration = false;
                context.fieldsContainLocalDate = false;
                context.fieldsContainBigDecimal = false;
                context.fieldsContainBlob = false;
                context.fieldsContainImageBlob = false;
                context.fieldsContainTextBlob = false;
                context.fieldsContainBlobOrImage = false;
                context.validation = false;
                context.fieldsContainOwnerManyToMany = false;
                context.fieldsContainNoOwnerOneToOne = false;
                context.fieldsContainOwnerOneToOne = false;
                context.fieldsContainOneToMany = false;
                context.fieldsContainManyToOne = false;
                context.fieldsContainEmbedded = false;
                context.fieldsIsReactAvField = false;
                context.blobFields = [];
                context.differentTypes = [context.entityClass];
                if (!context.relationships) {
                    context.relationships = [];
                }
                context.differentRelationships = {};
                context.i18nToLoad = [context.entityInstance];
                context.i18nKeyPrefix = `${context.angularAppName}.${context.entityTranslationKey}`;

                // Load in-memory data for fields
                context.fields.forEach(field => {
                    const fieldOptions = field.options || {};
                    // Migration from JodaTime to Java Time
                    if (field.fieldType === 'DateTime' || field.fieldType === 'Date') {
                        field.fieldType = 'Instant';
                    }
                    const fieldType = field.fieldType;

                    if (!['Instant', 'ZonedDateTime', 'Boolean'].includes(fieldType)) {
                        context.fieldsIsReactAvField = true;
                    }

                    field.fieldIsEnum = ![
                        'String',
                        'Integer',
                        'Long',
                        'Float',
                        'Double',
                        'BigDecimal',
                        'LocalDate',
                        'Instant',
                        'ZonedDateTime',
                        'Duration',
                        'UUID',
                        'Boolean',
                        'byte[]',
                        'ByteBuffer',
                    ].includes(fieldType);

                    if (field.fieldIsEnum === true) {
                        context.i18nToLoad.push(field.enumInstance);
                    }

                    if (_.isUndefined(field.fieldNameCapitalized)) {
                        field.fieldNameCapitalized = _.upperFirst(field.fieldName);
                    }

                    if (_.isUndefined(field.fieldNameUnderscored)) {
                        field.fieldNameUnderscored = _.snakeCase(field.fieldName);
                    }

                    if (_.isUndefined(field.fieldNameAsDatabaseColumn)) {
                        const fieldNameUnderscored = _.snakeCase(field.fieldName);
                        const jhiFieldNamePrefix = this.getColumnName(context.jhiPrefix);
                        if (isReservedTableName(fieldNameUnderscored, context.prodDatabaseType)) {
                            if (!jhiFieldNamePrefix) {
                                this.warning(
                                    `The field name '${fieldNameUnderscored}' is regarded as a reserved keyword, but you have defined an empty jhiPrefix. This might lead to a non-working application.`
                                );
                                field.fieldNameAsDatabaseColumn = fieldNameUnderscored;
                            } else {
                                field.fieldNameAsDatabaseColumn = `${jhiFieldNamePrefix}_${fieldNameUnderscored}`;
                            }
                        } else {
                            field.fieldNameAsDatabaseColumn = fieldNameUnderscored;
                        }
                    }

                    if (_.isUndefined(field.fieldNameHumanized)) {
                        field.fieldNameHumanized = fieldOptions.fieldNameHumanized || _.startCase(field.fieldName);
                    }

                    if (_.isUndefined(field.fieldInJavaBeanMethod)) {
                        // Handle the specific case when the second letter is capitalized
                        // See http://stackoverflow.com/questions/2948083/naming-convention-for-getters-setters-in-java
                        if (field.fieldName.length > 1) {
                            const firstLetter = field.fieldName.charAt(0);
                            const secondLetter = field.fieldName.charAt(1);
                            if (firstLetter === firstLetter.toLowerCase() && secondLetter === secondLetter.toUpperCase()) {
                                field.fieldInJavaBeanMethod = firstLetter.toLowerCase() + field.fieldName.slice(1);
                            } else {
                                field.fieldInJavaBeanMethod = _.upperFirst(field.fieldName);
                            }
                        } else {
                            field.fieldInJavaBeanMethod = _.upperFirst(field.fieldName);
                        }
                    }

                    if (_.isUndefined(field.fieldValidateRulesPatternJava)) {
                        field.fieldValidateRulesPatternJava = field.fieldValidateRulesPattern
                            ? field.fieldValidateRulesPattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                            : field.fieldValidateRulesPattern;
                    }

                    if (_.isUndefined(field.fieldValidateRulesPatternAngular)) {
                        field.fieldValidateRulesPatternAngular = field.fieldValidateRulesPattern
                            ? field.fieldValidateRulesPattern.replace(/"/g, '&#34;')
                            : field.fieldValidateRulesPattern;
                    }

                    if (_.isUndefined(field.fieldValidateRulesPatternReact)) {
                        field.fieldValidateRulesPatternReact = field.fieldValidateRulesPattern
                            ? field.fieldValidateRulesPattern.replace(/'/g, "\\'")
                            : field.fieldValidateRulesPattern;
                    }

                    field.fieldValidate = _.isArray(field.fieldValidateRules) && field.fieldValidateRules.length >= 1;

                    if (fieldType === 'ZonedDateTime') {
                        context.fieldsContainZonedDateTime = true;
                        context.fieldsContainDate = true;
                    } else if (fieldType === 'Instant') {
                        context.fieldsContainInstant = true;
                        context.fieldsContainDate = true;
                    } else if (fieldType === 'Duration') {
                        context.fieldsContainDuration = true;
                    } else if (fieldType === 'LocalDate') {
                        context.fieldsContainLocalDate = true;
                        context.fieldsContainDate = true;
                    } else if (fieldType === 'BigDecimal') {
                        context.fieldsContainBigDecimal = true;
                    } else if (fieldType === 'UUID') {
                        context.fieldsContainUUID = true;
                    } else if (fieldType === 'byte[]' || fieldType === 'ByteBuffer') {
                        context.blobFields.push(field);
                        context.fieldsContainBlob = true;
                        if (field.fieldTypeBlobContent === 'image') {
                            context.fieldsContainImageBlob = true;
                        }
                        if (field.fieldTypeBlobContent !== 'text') {
                            context.fieldsContainBlobOrImage = true;
                        } else {
                            context.fieldsContainTextBlob = true;
                        }
                    }

                    if (field.fieldValidate) {
                        context.validation = true;
                    }
                });
                let hasUserField = false;
                // Load in-memory data for relationships
                context.relationships.forEach(relationship => {
                    const relationshipOptions = relationship.options || {};
                    const otherEntityName = relationship.otherEntityName;
                    const otherEntityData = this._getEntityJson(otherEntityName);
                    if (otherEntityData) {
                        if (otherEntityData.microserviceName && !otherEntityData.clientRootFolder) {
                            otherEntityData.clientRootFolder = otherEntityData.microserviceName;
                        }
                        if (otherEntityData.embedded) {
                            relationship.otherEntityIsEmbedded = true;
                        }
                    }
                    const jhiTablePrefix = context.jhiTablePrefix;

                    relationship.otherEntityPrimaryKeyType =
                        relationship.otherEntityName === 'user' && context.authenticationType === 'oauth2'
                            ? 'String'
                            : this.getPkType(context.databaseType);

                    // Look for fields at the other other side of the relationship
                    if (otherEntityData && otherEntityData.relationships) {
                        if (relationship.relationshipType === 'many-to-one' || relationship.relationshipType === 'many-to-many') {
                            otherEntityData.relationships.forEach(otherRelationship => {
                                if (_.upperFirst(otherRelationship.otherEntityName) !== entityName) {
                                    return;
                                }
                                // otherEntityRelationshipName can be missing
                                if (!otherRelationship.otherEntityRelationshipName) {
                                    this.warning(
                                        `Cannot compare relationship reference: otherEntityRelationshipName is missing in .jhipster/${otherEntityName}.json for relationship ${stringify(
                                            otherRelationship
                                        )}`
                                    );
                                    return;
                                }
                                if (otherRelationship.otherEntityRelationshipName !== relationship.relationshipName) {
                                    return;
                                }
                                if (
                                    (relationship.relationshipType === 'many-to-one' &&
                                        otherRelationship.relationshipType === 'one-to-many') ||
                                    (relationship.relationshipType === 'many-to-many' &&
                                        otherRelationship.relationshipType === 'many-to-many')
                                ) {
                                    relationship.otherEntityRelationshipName =
                                        relationship.otherEntityRelationshipName || otherRelationship.relationshipName;
                                    relationship.otherEntityRelationshipNamePlural =
                                        relationship.otherEntityRelationshipNamePlural || pluralize(otherRelationship.relationshipName);
                                    relationship.otherEntityRelationshipNameCapitalized =
                                        relationship.otherEntityRelationshipNameCapitalized ||
                                        _.upperFirst(otherRelationship.relationshipName);
                                    relationship.otherEntityRelationshipNameCapitalizedPlural = relationship.otherEntityRelationshipNameCapitalizedPlural = pluralize(
                                        relationship.otherEntityRelationshipNameCapitalized
                                    );
                                }
                            });
                        }
                    }

                    if (!_.isUndefined(relationship.otherEntityRelationshipName)) {
                        if (_.isUndefined(relationship.otherEntityRelationshipNamePlural)) {
                            relationship.otherEntityRelationshipNamePlural = pluralize(relationship.otherEntityRelationshipName);
                        }

                        if (_.isUndefined(relationship.otherEntityRelationshipNameCapitalized)) {
                            relationship.otherEntityRelationshipNameCapitalized = _.upperFirst(relationship.otherEntityRelationshipName);
                        }

                        if (_.isUndefined(relationship.otherEntityRelationshipNameCapitalizedPlural)) {
                            relationship.otherEntityRelationshipNameCapitalizedPlural = pluralize(
                                _.upperFirst(relationship.otherEntityRelationshipName)
                            );
                        }
                    }

                    if (_.isUndefined(relationship.relationshipNameCapitalized)) {
                        relationship.relationshipNameCapitalized = _.upperFirst(relationship.relationshipName);
                    }

                    if (_.isUndefined(relationship.relationshipNameCapitalizedPlural)) {
                        if (relationship.relationshipName.length > 1) {
                            relationship.relationshipNameCapitalizedPlural = pluralize(_.upperFirst(relationship.relationshipName));
                        } else {
                            relationship.relationshipNameCapitalizedPlural = _.upperFirst(pluralize(relationship.relationshipName));
                        }
                    }

                    if (_.isUndefined(relationship.relationshipNameHumanized)) {
                        relationship.relationshipNameHumanized =
                            relationshipOptions.relationshipNameHumanized || _.startCase(relationship.relationshipName);
                    }

                    if (_.isUndefined(relationship.relationshipNamePlural)) {
                        relationship.relationshipNamePlural = pluralize(relationship.relationshipName);
                    }

                    if (_.isUndefined(relationship.relationshipFieldName)) {
                        relationship.relationshipFieldName = _.lowerFirst(relationship.relationshipName);
                    }

                    if (_.isUndefined(relationship.relationshipFieldNamePlural)) {
                        relationship.relationshipFieldNamePlural = pluralize(_.lowerFirst(relationship.relationshipName));
                    }

                    if (context.dto && context.dto === 'mapstruct') {
                        if (
                            otherEntityData &&
                            (!otherEntityData.dto || otherEntityData.dto !== 'mapstruct') &&
                            otherEntityName !== 'user'
                        ) {
                            this.warning(
                                `This entity has the DTO option, and it has a relationship with entity "${otherEntityName}" that doesn't have the DTO option. This will result in an error.`
                            );
                        }
                    }

                    if (otherEntityName === 'user') {
                        relationship.otherEntityTableName = `${jhiTablePrefix}_user`;
                        hasUserField = true;
                    } else {
                        relationship.otherEntityTableName = otherEntityData ? otherEntityData.entityTableName : null;
                        if (!relationship.otherEntityTableName) {
                            relationship.otherEntityTableName = this.getTableName(otherEntityName);
                        }
                        if (isReservedTableName(relationship.otherEntityTableName, context.prodDatabaseType) && jhiTablePrefix) {
                            const otherEntityTableName = relationship.otherEntityTableName;
                            relationship.otherEntityTableName = `${jhiTablePrefix}_${otherEntityTableName}`;
                        }
                    }

                    if (_.isUndefined(relationship.otherEntityNamePlural)) {
                        relationship.otherEntityNamePlural = pluralize(relationship.otherEntityName);
                    }

                    if (_.isUndefined(relationship.otherEntityNameCapitalized)) {
                        relationship.otherEntityNameCapitalized = _.upperFirst(relationship.otherEntityName);
                    }

                    if (_.isUndefined(relationship.otherEntityAngularName)) {
                        if (relationship.otherEntityNameCapitalized !== 'User') {
                            const otherEntityAngularSuffix = otherEntityData ? otherEntityData.angularJSSuffix || '' : '';
                            relationship.otherEntityAngularName =
                                _.upperFirst(relationship.otherEntityName) + this.upperFirstCamelCase(otherEntityAngularSuffix);
                        } else {
                            relationship.otherEntityAngularName = 'User';
                        }
                    }

                    if (_.isUndefined(relationship.otherEntityNameCapitalizedPlural)) {
                        relationship.otherEntityNameCapitalizedPlural = pluralize(_.upperFirst(relationship.otherEntityName));
                    }

                    if (_.isUndefined(relationship.otherEntityFieldCapitalized)) {
                        relationship.otherEntityFieldCapitalized = _.upperFirst(relationship.otherEntityField);
                    }

                    if (_.isUndefined(relationship.otherEntityStateName)) {
                        relationship.otherEntityStateName = _.kebabCase(relationship.otherEntityAngularName);
                    }
                    if (_.isUndefined(relationship.otherEntityModuleName)) {
                        if (relationship.otherEntityNameCapitalized !== 'User') {
                            relationship.otherEntityModuleName = `${
                                context.angularXAppName + relationship.otherEntityNameCapitalized
                            }Module`;
                            relationship.otherEntityFileName = _.kebabCase(relationship.otherEntityAngularName);
                            if (relationship.otherEntityFolderName === undefined) {
                                relationship.otherEntityFolderName = _.kebabCase(relationship.otherEntityAngularName);
                            }
                            if (
                                context.skipUiGrouping ||
                                otherEntityData === undefined ||
                                otherEntityData.clientRootFolder === '' ||
                                otherEntityData.clientRootFolder === undefined
                            ) {
                                relationship.otherEntityClientRootFolder = '';
                            } else {
                                relationship.otherEntityClientRootFolder = `${otherEntityData.clientRootFolder}/`;
                            }
                            if (otherEntityData !== undefined && otherEntityData.clientRootFolder) {
                                if (context.clientRootFolder === otherEntityData.clientRootFolder) {
                                    relationship.otherEntityModulePath = relationship.otherEntityFolderName;
                                } else {
                                    relationship.otherEntityModulePath = `${
                                        context.entityParentPathAddition ? `${context.entityParentPathAddition}/` : ''
                                    }${otherEntityData.clientRootFolder}/${relationship.otherEntityFolderName}`;
                                }
                                relationship.otherEntityModelName = `${otherEntityData.clientRootFolder}/${relationship.otherEntityFileName}`;
                                relationship.otherEntityPath = `${otherEntityData.clientRootFolder}/${relationship.otherEntityFolderName}`;
                            } else {
                                relationship.otherEntityModulePath = `${
                                    context.entityParentPathAddition ? `${context.entityParentPathAddition}/` : ''
                                }${relationship.otherEntityFolderName}`;
                                relationship.otherEntityModelName = relationship.otherEntityFileName;
                                relationship.otherEntityPath = relationship.otherEntityFolderName;
                            }
                        } else {
                            relationship.otherEntityModuleName = `${context.angularXAppName}SharedModule`;
                            relationship.otherEntityModulePath = 'app/core';
                        }
                    }
                    if (otherEntityData) {
                        this._copyFilteringFlag(otherEntityData, relationship, { ...otherEntityData, databaseType: context.databaseType });
                    }
                    // Load in-memory data for root
                    if (relationship.relationshipType === 'many-to-many' && relationship.ownerSide) {
                        context.fieldsContainOwnerManyToMany = true;
                    } else if (relationship.relationshipType === 'one-to-one' && !relationship.ownerSide) {
                        context.fieldsContainNoOwnerOneToOne = true;
                    } else if (relationship.relationshipType === 'one-to-one' && relationship.ownerSide) {
                        context.fieldsContainOwnerOneToOne = true;
                    } else if (relationship.relationshipType === 'one-to-many') {
                        context.fieldsContainOneToMany = true;
                    } else if (relationship.relationshipType === 'many-to-one') {
                        context.fieldsContainManyToOne = true;
                    }
                    if (relationship.otherEntityIsEmbedded) {
                        context.fieldsContainEmbedded = true;
                    }

                    if (relationship.relationshipValidateRules && relationship.relationshipValidateRules.includes('required')) {
                        if (entityName.toLowerCase() === relationship.otherEntityName.toLowerCase()) {
                            this.warning('Required relationships to the same entity are not supported.');
                        } else {
                            relationship.relationshipValidate = relationship.relationshipRequired = context.validation = true;
                        }
                    }

                    const entityType = relationship.otherEntityNameCapitalized;
                    if (!context.differentTypes.includes(entityType)) {
                        context.differentTypes.push(entityType);
                    }
                    if (!context.differentRelationships[entityType]) {
                        context.differentRelationships[entityType] = [];
                    }
                    context.differentRelationships[entityType].push(relationship);
                });

                context.saveUserSnapshot =
                    context.applicationType === 'microservice' &&
                    context.authenticationType === 'oauth2' &&
                    hasUserField &&
                    context.dto === 'no';

                context.primaryKeyType = this.getPkTypeBasedOnDBAndAssociation(
                    context.authenticationType,
                    context.databaseType,
                    context.relationships
                );
                // Deprecated: kept for compatibility, should be removed in next major release
                context.pkType = context.primaryKeyType;
                context.hasUserField = hasUserField;
            },

            insight() {
                // track insights
                const context = this.context;

                statistics.sendEntityStats(
                    context.fields.length,
                    context.relationships.length,
                    context.pagination,
                    context.dto,
                    context.service,
                    context.fluentMethods
                );
            },
        };
    }

    get configuring() {
        if (useBlueprints) return;
        return this._configuring();
    }

    // Public API method used by the getter and also by Blueprints
    _writing() {
        return {
            cleanup() {
                const context = this.context;
                const entityName = context.name;
                if (this.isJhipsterVersionLessThan('5.0.0')) {
                    this.removeFile(`${constants.ANGULAR_DIR}entities/${entityName}/${entityName}.model.ts`);
                }
                if (this.isJhipsterVersionLessThan('6.3.0') && context.clientFramework === ANGULAR) {
                    this.removeFile(`${constants.ANGULAR_DIR}entities/${context.entityFolderName}/index.ts`);
                }
            },

            composeServer() {
                const context = this.context;
                if (context.skipServer) return;
                const configOptions = this.configOptions;

                this.composeWith(require.resolve('../entity-server'), {
                    context,
                    configOptions,
                    force: context.options.force,
                    debug: context.isDebugEnabled,
                });
            },

            composeClient() {
                const context = this.context;
                if (context.skipClient) return;
                const configOptions = this.configOptions;

                this.composeWith(require.resolve('../entity-client'), {
                    context,
                    configOptions,
                    skipInstall: context.options.skipInstall,
                    force: context.options.force,
                    debug: context.isDebugEnabled,
                });
            },

            composeI18n() {
                const context = this.context;
                if (context.skipClient) return;
                const configOptions = this.configOptions;
                this.composeWith(require.resolve('../entity-i18n'), {
                    context,
                    configOptions,
                    skipInstall: context.options.skipInstall,
                    force: context.options.force,
                    debug: context.isDebugEnabled,
                });
            },
        };
    }

    get writing() {
        if (useBlueprints) return;
        return this._writing();
    }

    // Public API method used by the getter and also by Blueprints
    _install() {
        return {
            afterRunHook() {
                const done = this.async();
                try {
                    const modules = this.getModuleHooks();
                    if (modules.length > 0) {
                        this.log(`\n${chalk.bold.green('Running post run module hooks\n')}`);
                        // form the data to be passed to modules
                        const context = this.context;

                        // Keep context.data for unexpected compatibility issue.
                        context.data = context.data || this.storageData || context.fileData;

                        // run through all post entity creation module hooks
                        this.callHooks(
                            'entity',
                            'post',
                            {
                                entityConfig: context,
                                force: context.options.force,
                            },
                            done
                        );
                    } else {
                        done();
                    }
                } catch (err) {
                    this.log(`\n${chalk.bold.red('Running post run module hooks failed. No modification done to the generated entity.')}`);
                    this.debug('Error:', err);
                    done();
                }
            },
        };
    }

    get install() {
        if (useBlueprints) return;
        return this._install();
    }

    /**
     * Validate the entityName
     * @return {true|string} true for a valid value or error message.
     */
    _validateEntityName(entityName) {
        if (!/^([a-zA-Z0-9]*)$/.test(entityName)) {
            return 'The entity name must be alphanumeric only';
        }
        if (/^[0-9].*$/.test(entityName)) {
            return 'The entity name cannot start with a number';
        }
        if (entityName === '') {
            return 'The entity name cannot be empty';
        }
        if (entityName.indexOf('Detail', entityName.length - 'Detail'.length) !== -1) {
            return "The entity name cannot end with 'Detail'";
        }
        if (!this.context.skipServer && isReservedClassName(entityName)) {
            return 'The entity name cannot contain a Java or JHipster reserved keyword';
        }
        return true;
    }

    /**
     * Validate the entityTableName
     * @return {true|string} true for a valid value or error message.
     */
    _validateTableName(entityTableName) {
        const context = this.context;
        const prodDatabaseType = context.prodDatabaseType;
        const jhiTablePrefix = context.jhiTablePrefix;
        const skipCheckLengthOfIdentifier = context.skipCheckLengthOfIdentifier;
        const instructions = `You can specify a different table name in your JDL file or change it in .jhipster/${context.name}.json file and then run again 'jhipster entity ${context.name}.'`;

        if (!/^([a-zA-Z0-9_]*)$/.test(entityTableName)) {
            return `The table name cannot contain special characters.\n${instructions}`;
        }
        if (entityTableName === '') {
            return 'The table name cannot be empty';
        }
        if (isReservedTableName(entityTableName, prodDatabaseType)) {
            if (jhiTablePrefix) {
                this.warning(
                    `The table name cannot contain the '${entityTableName.toUpperCase()}' reserved keyword, so it will be prefixed with '${jhiTablePrefix}_'.\n${instructions}`
                );
                context.entityTableName = `${jhiTablePrefix}_${entityTableName}`;
            } else {
                this.warning(
                    `The table name contain the '${entityTableName.toUpperCase()}' reserved keyword but you have defined an empty jhiPrefix so it won't be prefixed and thus the generated application might not work'.\n${instructions}`
                );
            }
        } else if (prodDatabaseType === 'oracle' && entityTableName.length > 26 && !skipCheckLengthOfIdentifier) {
            return `The table name is too long for Oracle, try a shorter name.\n${instructions}`;
        } else if (prodDatabaseType === 'oracle' && entityTableName.length > 14 && !skipCheckLengthOfIdentifier) {
            this.warning(
                `The table name is long for Oracle, long table names can cause issues when used to create constraint names and join table names.\n${instructions}`
            );
        }
        return true;
    }

    /**
     * get an entity from the configuration file
     * @param {string} file - configuration file name for the entity
     */
    _getEntityJson(file) {
        let entityJson = null;

        try {
            let filename = path.join(JHIPSTER_CONFIG_DIR, `${_.upperFirst(file)}.json`);
            if (this.context && this.context.microservicePath) {
                filename = path.join(this.context.microservicePath, filename);
            }
            // TODO 7.0 filename = this.destinationPath(filename);
            entityJson = this.fs.readJSON(filename);
        } catch (err) {
            this.log(chalk.red(`The JHipster entity configuration file could not be read for file ${file}!`) + err);
            this.debug('Error:', err);
        }

        return entityJson;
    }

    /**
     * Setup Entity instance level options from context.
     * all variables should be set to dest,
     * all variables should be referred from context,
     * all methods should be called on generator,
     * @param {any} generator - generator instance
     * @param {any} context - context to use default is generator instance
     * @param {any} dest - destination context to use default is context
     */
    _setupEntityOptions(generator, context = generator, dest = context) {
        dest.regenerate = context.options.regenerate;

        if (context.options.fluentMethods !== undefined) {
            this.entityConfig.fluentMethods = context.options.fluentMethods;
        }
        if (context.options.skipCheckLengthOfIdentifier !== undefined) {
            this.entityConfig.skipCheckLengthOfIdentifier = context.options.skipCheckLengthOfIdentifier;
        }
        if (context.options.angularSuffix !== undefined) {
            this.entityConfig.angularJSSuffix = context.options.angularSuffix;
        }
        if (context.options.skipUiGrouping !== undefined) {
            this.entityConfig.skipUiGrouping = context.options.skipUiGrouping;
        }
        if (context.options.clientRootFolder !== undefined) {
            this.entityConfig.clientRootFolder = context.options.skipUiGrouping ? '' : context.options.clientRootFolder;
        }
        dest.isDebugEnabled = context.options.debug;
        dest.experimental = context.options.experimental;

        dest.entityNameCapitalized = _.upperFirst(dest.name);
        dest.entityTableName = generator.getTableName(context.options.tableName || dest.name);
        if (this.entityConfig.angularJSSuffix && !this.entityConfig.angularJSSuffix.startsWith('-')) {
            this.entityConfig.angularJSSuffix = `-${this.entityConfig.angularJSSuffix}`;
        }
    }

    /**
     * Copy Filtering Flag
     *
     * @param {any} from - from
     * @param {any} to - to
     * @param {any} context - generator context
     */
    _copyFilteringFlag(from, to, context = this) {
        if (context.databaseType === 'sql' && context.service !== 'no') {
            to.jpaMetamodelFiltering = from.jpaMetamodelFiltering;
        } else {
            to.jpaMetamodelFiltering = false;
        }
    }

    /**
     * Load an entity configuration file into context.
     */
    _loadEntityJson(fromPath = this.context.fromPath) {
        const context = this.context;
        try {
            context.fileData = this.fs.readJSON(fromPath);
        } catch (err) {
            this.debug('Error:', err);
            this.error('\nThe entity configuration file could not be read!\n');
        }
        if (context.fileData.databaseType) {
            context.databaseType = context.fileData.databaseType;
        }
        context.relationships = context.fileData.relationships || [];
        context.fields = context.fileData.fields || [];
        context.haveFieldWithJavadoc = false;
        context.changelogDate = context.fileData.changelogDate;
        context.dto = context.fileData.dto;
        context.service = context.fileData.service;
        context.fluentMethods = context.fileData.fluentMethods;
        context.clientRootFolder = context.fileData.clientRootFolder;
        context.pagination = context.fileData.pagination;
        context.searchEngine = _.isUndefined(context.fileData.searchEngine) ? context.searchEngine : context.fileData.searchEngine;
        context.javadoc = context.fileData.javadoc;
        context.entityTableName = context.fileData.entityTableName;
        context.jhiPrefix = context.fileData.jhiPrefix || context.jhiPrefix;
        context.skipCheckLengthOfIdentifier = context.fileData.skipCheckLengthOfIdentifier || context.skipCheckLengthOfIdentifier;
        context.jhiTablePrefix = this.getTableName(context.jhiPrefix);
        context.skipClient = context.fileData.skipClient || context.skipClient;
        context.readOnly = context.fileData.readOnly || false;
        context.embedded = context.fileData.embedded || false;

        context.fields.forEach(field => {
            if (field.javadoc) {
                context.haveFieldWithJavadoc = true;
            }
        });
        this._copyFilteringFlag(context.fileData, context, context);
        if (_.isUndefined(context.entityTableName)) {
            this.warning(`entityTableName is missing in .jhipster/${context.name}.json, using entity name as fallback`);
            context.entityTableName = this.getTableName(context.name);
        }
        if (isReservedTableName(context.entityTableName, context.prodDatabaseType) && context.jhiPrefix) {
            context.entityTableName = `${context.jhiTablePrefix}_${context.entityTableName}`;
        }
        context.fields.forEach(field => {
            context.fieldNamesUnderscored.push(_.snakeCase(field.fieldName));
            context.fieldNameChoices.push({ name: field.fieldName, value: field.fieldName });
        });
        context.relationships.forEach(rel => {
            context.relNameChoices.push({
                name: `${rel.relationshipName}:${rel.relationshipType}`,
                value: `${rel.relationshipName}:${rel.relationshipType}`,
            });
        });
        if (context.fileData.angularJSSuffix !== undefined) {
            context.entityAngularJSSuffix = context.fileData.angularJSSuffix;
        }
        context.useMicroserviceJson = context.useMicroserviceJson || !_.isUndefined(context.fileData.microserviceName);
        if (context.applicationType === 'gateway' && context.useMicroserviceJson) {
            context.microserviceName = context.fileData.microserviceName;
            if (!context.microserviceName) {
                this.error('Microservice name for the entity is not found. Entity cannot be generated!');
            }
            context.microserviceAppName = this.getMicroserviceAppName(context.microserviceName);
            context.skipServer = true;
        }
    }
}

module.exports = EntityGenerator;
