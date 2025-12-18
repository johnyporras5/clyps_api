const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Configuración
const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3307,  // Puerto correcto: 3307
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'clyps'  // Base de datos correcta
  },
  paths: {
    baseSrc: 'src'  // Asegúrate que esta ruta existe en tu proyecto
  }
};

// Función para capitalizar nombres
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Función para convertir snake_case a camelCase
function snakeToCamel(str) {
  return str.replace(/(_[a-z])/g, (group) => group.toUpperCase().replace('_', ''));
}

// Función para nombres de archivo consistentes (siempre minúsculas)
function toLowerCase(str) {
  return str.toLowerCase();
}

// Función para obtener el tipo TypeScript (MEJORADA)
function getTypeScriptType(mysqlType) {
  const cleanType = mysqlType.toLowerCase().split('(')[0];
  
  const typeMap = {
    'int': 'number',
    'tinyint': 'number',
    'smallint': 'number',
    'mediumint': 'number',
    'bigint': 'number',
    'float': 'number',
    'double': 'number',
    'decimal': 'number',
    'numeric': 'number',
    'varchar': 'string',
    'char': 'string',
    'text': 'string',
    'tinytext': 'string',
    'mediumtext': 'string',
    'longtext': 'string',
    'datetime': 'Date',
    'timestamp': 'Date',
    'date': 'Date',
    'time': 'Date',
    'year': 'number',
    'boolean': 'boolean',
    'bool': 'boolean',
    'json': 'any',
    'enum': 'string',
    'set': 'string'
  };
  
  return typeMap[cleanType] || 'any';
}

// Función MEJORADA para verificar si un tipo de columna soporta longitud
function supportsLength(dataType) {
  const cleanType = dataType.toLowerCase().split('(')[0];
  // Solo estos tipos soportan length en TypeORM
  const typesWithLength = ['varchar', 'char', 'binary', 'varbinary'];
  return typesWithLength.includes(cleanType);
}

// Función para verificar si es un tipo de texto que NO debe tener length
function isTextType(dataType) {
  const cleanType = dataType.toLowerCase().split('(')[0];
  const textTypes = ['text', 'tinytext', 'mediumtext', 'longtext', 'blob', 'tinyblob', 'mediumblob', 'longblob'];
  return textTypes.includes(cleanType);
}

// Función SIMPLIFICADA para verificar si una columna debe ser excluida de los DTOs
function shouldExcludeFromDTO(columnName) {
  const excludedColumns = [
    'createdat', 'updatedat', 'created_at', 'updated_at',
    'deletedat', 'deleted_at', 'version', 'timestamp'
  ];
  
  const normalizedColumnName = columnName.toLowerCase().replace(/_/g, '');
  return excludedColumns.includes(normalizedColumnName);
}

// Función para verificar si es un campo isActive
function isActiveField(columnName) {
  const activeFields = ['isactive', 'is_active', 'active', 'enabled'];
  const normalizedColumnName = columnName.toLowerCase().replace(/_/g, '');
  return activeFields.includes(normalizedColumnName);
}

// Función para generar la entidad (CORREGIDA - manejo mejorado de tipos)
function generateEntityTemplate(tableName, columns) {
  const className = capitalize(snakeToCamel(tableName));
  
  let imports = `import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';\n\n`;
  let classContent = `@Entity('${tableName}')\nexport class ${className} {\n`;

  console.log(`\n🔍 Generando entidad para tabla: ${tableName}`);
  console.log(`📋 Columnas encontradas:`, columns.map(col => ({
    name: col.COLUMN_NAME,
    type: col.DATA_TYPE,
    key: col.COLUMN_KEY,
    nullable: col.IS_NULLABLE,
    length: col.CHARACTER_MAXIMUM_LENGTH
  })));

  // Encontrar la columna primaria
  const primaryColumn = columns.find(col => col.COLUMN_KEY === 'PRI');
  
  if (!primaryColumn) {
    console.warn(`⚠️  Advertencia: La tabla ${tableName} no tiene una columna primaria definida. Se agregará un id automático.`);
    classContent += `\n  @PrimaryGeneratedColumn()\n  id: number;\n`;
  } else {
    columns.forEach(col => {
      const propName = snakeToCamel(col.COLUMN_NAME);
      const isPrimary = col.COLUMN_KEY === 'PRI';
      const isAutoIncrement = col.EXTRA.includes('auto_increment');
      const dataType = col.DATA_TYPE.toLowerCase();
      const columnName = col.COLUMN_NAME.toLowerCase();
      
      console.log(`   📝 Procesando columna: ${col.COLUMN_NAME} -> ${propName} (${dataType})`);
      
      // Manejar campos de timestamp automáticos
      if (columnName === 'createdat' || columnName === 'created_at') {
        classContent += `\n  @CreateDateColumn()\n  ${propName}: Date;\n`;
        return;
      }
      
      if (columnName === 'updatedat' || columnName === 'updated_at') {
        classContent += `\n  @UpdateDateColumn()\n  ${propName}: Date;\n`;
        return;
      }
      
      if (isPrimary) {
        if (isAutoIncrement) {
          classContent += `\n  @PrimaryGeneratedColumn()\n  ${propName}: ${getTypeScriptType(col.DATA_TYPE)};\n`;
        } else {
          // COLUMNA PRIMARIA NO AUTO-INCREMENT
          const columnOptions = [];
          columnOptions.push(`name: '${col.COLUMN_NAME}'`);
          
          // Para tipos de texto, NO usar length
          if (isTextType(col.DATA_TYPE)) {
            columnOptions.push(`type: '${col.DATA_TYPE}'`);
          } else if (!['int', 'varchar', 'text'].includes(dataType)) {
            columnOptions.push(`type: '${col.DATA_TYPE}'`);
          }
          
          // Solo agregar length para tipos que lo soportan y NO son texto
          if (supportsLength(col.DATA_TYPE) && col.CHARACTER_MAXIMUM_LENGTH && !isTextType(col.DATA_TYPE)) {
            columnOptions.push(`length: ${col.CHARACTER_MAXIMUM_LENGTH}`);
          }
          
          if (col.IS_NULLABLE === 'YES') {
            columnOptions.push(`nullable: true`);
          }
          
          if (columnOptions.length > 0) {
            classContent += `\n  @PrimaryColumn({ ${columnOptions.join(', ')} })\n  ${propName}: ${getTypeScriptType(col.DATA_TYPE)};\n`;
          } else {
            classContent += `\n  @PrimaryColumn()\n  ${propName}: ${getTypeScriptType(col.DATA_TYPE)};\n`;
          }
        }
      } else {
        // Columnas normales (no primarias) - INCLUIR TODAS
        const columnOptions = [];
        columnOptions.push(`name: '${col.COLUMN_NAME}'`);
        
        // Para tipos de texto, especificar el type pero NO length
        if (isTextType(col.DATA_TYPE)) {
          columnOptions.push(`type: '${col.DATA_TYPE}'`);
        } else if (!['int', 'varchar', 'text', 'datetime', 'timestamp'].includes(dataType)) {
          columnOptions.push(`type: '${col.DATA_TYPE}'`);
        }
        
        // Solo agregar length para tipos que lo soportan y NO son texto
        if (supportsLength(col.DATA_TYPE) && col.CHARACTER_MAXIMUM_LENGTH && !isTextType(col.DATA_TYPE)) {
          columnOptions.push(`length: ${col.CHARACTER_MAXIMUM_LENGTH}`);
        }
        
        if (col.IS_NULLABLE === 'YES') {
          columnOptions.push(`nullable: true`);
        }
        
        // Agregar default: 1 para campos isActive
        if (isActiveField(col.COLUMN_NAME) && dataType === 'tinyint') {
          columnOptions.push(`default: 1`);
        }
        
        if (columnOptions.length > 0) {
          classContent += `\n  @Column({ ${columnOptions.join(', ')} })\n  ${propName}: ${getTypeScriptType(col.DATA_TYPE)};\n`;
        } else {
          classContent += `\n  @Column()\n  ${propName}: ${getTypeScriptType(col.DATA_TYPE)};\n`;
        }
      }
    });
  }

  classContent += `}\n`;
  return imports + classContent;
}

// Plantilla para los DTOs (MEJORADA - solo excluye campos técnicos)
function generateDtoTemplates(className, fileName, columns) {
  const camelName = snakeToCamel(className);
  
  // Create DTO
  let createDtoImports = `import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';\n\n`;
  let createDtoContent = `export class Create${className}Dto {\n`;
  
  // Update DTO
  let updateDtoImports = `import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';\n\n`;
  let updateDtoContent = `export class Update${className}Dto {\n`;

  console.log(`\n🔍 Generando DTOs para: ${className}`);
  console.log(`📋 Columnas disponibles para DTOs:`, columns.map(col => col.COLUMN_NAME));

  // Encontrar la columna primaria
  const primaryColumn = columns.find(col => col.COLUMN_KEY === 'PRI');

  columns.forEach(col => {
    const propName = snakeToCamel(col.COLUMN_NAME);
    const isPrimary = col.COLUMN_KEY === 'PRI';
    const isAutoIncrement = col.EXTRA.includes('auto_increment');
    
    console.log(`   📝 Procesando DTO para: ${col.COLUMN_NAME} -> ${propName}`);
    
    // Skip primary keys auto-increment (no se incluyen en DTOs de creación)
    if (isPrimary && isAutoIncrement) {
      console.log(`   ⏭️  Saltando PK auto-increment: ${col.COLUMN_NAME}`);
      return;
    }
    
    // Solo excluir campos técnicos de auditoría, NO campos de negocio
    if (shouldExcludeFromDTO(col.COLUMN_NAME)) {
      console.log(`   ⏭️  Excluyendo campo técnico: ${col.COLUMN_NAME}`);
      return;
    }

    console.log(`   ✅ Incluyendo campo en DTOs: ${col.COLUMN_NAME}`);

    const decorators = [];
    const type = getTypeScriptType(col.DATA_TYPE);
    
    // Determine validation decorators based on column properties
    if (col.IS_NULLABLE === 'NO' && !isPrimary) {
      decorators.push('@IsNotEmpty()');
    } else {
      decorators.push('@IsOptional()');
    }

    // Add type-specific validators
    if (col.COLUMN_NAME.toLowerCase().includes('email')) {
      decorators.push('@IsEmail()');
    } else if (type === 'string') {
      decorators.push('@IsString()');
    } else if (type === 'number') {
      decorators.push('@IsNumber()');
    } else if (type === 'boolean') {
      decorators.push('@IsBoolean()');
    }

    // For Create DTO - required fields
    if (col.IS_NULLABLE === 'NO' && !isPrimary) {
      createDtoContent += `\n  ${decorators.join('\n  ')}\n  ${propName}: ${type};\n`;
    } else {
      createDtoContent += `\n  ${decorators.join('\n  ')}\n  ${propName}?: ${type};\n`;
    }

    // For Update DTO - all fields are optional
    updateDtoContent += `\n  ${decorators.filter(d => d !== '@IsNotEmpty()').join('\n  ')}\n  ${propName}?: ${type};\n`;
  });

  createDtoContent += `}\n`;
  updateDtoContent += `}\n`;

  return {
    createDto: createDtoImports + createDtoContent,
    updateDto: updateDtoImports + updateDtoContent
  };
}

// Plantilla para el módulo
function generateModuleTemplate(className, fileName) {
  return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${className}Service } from './${fileName}.service';
import { ${className}Controller } from './${fileName}.controller';
import { ${className} } from './entities/${fileName}.entity';

@Module({
  imports: [TypeOrmModule.forFeature([${className}])],
  providers: [${className}Service],
  controllers: [${className}Controller],
  exports: [${className}Service],
})
export class ${className}Module {}
`;
}

// Plantilla para el servicio
function generateServiceTemplate(className, fileName, columns) {
  const camelName = snakeToCamel(className);
  const primaryColumn = columns.find(col => col.COLUMN_KEY === 'PRI');
  const primaryKeyName = primaryColumn ? snakeToCamel(primaryColumn.COLUMN_NAME) : 'id';
  const primaryKeyType = primaryColumn ? getTypeScriptType(primaryColumn.DATA_TYPE) : 'number';

  return `import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${className} } from './entities/${fileName}.entity';
import { Create${className}Dto } from './dto/create-${fileName}.dto';
import { Update${className}Dto } from './dto/update-${fileName}.dto';

@Injectable()
export class ${className}Service {
  constructor(
    @InjectRepository(${className})
    private ${camelName}Repository: Repository<${className}>,
  ) {}

  async findAll(): Promise<${className}[]> {
    return await this.${camelName}Repository.find();
  }

  async findOne(${primaryKeyName}: ${primaryKeyType}): Promise<${className}> {
    const ${camelName} = await this.${camelName}Repository.findOne({ where: { ${primaryKeyName} } });
    if (!${camelName}) {
      throw new NotFoundException(\`${className} with ${primaryKeyName} \${${primaryKeyName}} not found\`);
    }
    return ${camelName};
  }

  async create(create${className}Dto: Create${className}Dto): Promise<${className}> {
    const ${camelName} = this.${camelName}Repository.create(create${className}Dto);
    return await this.${camelName}Repository.save(${camelName});
  }

  async update(${primaryKeyName}: ${primaryKeyType}, update${className}Dto: Update${className}Dto): Promise<${className}> {
    const ${camelName} = await this.${camelName}Repository.findOne({ where: { ${primaryKeyName} } });
    if (!${camelName}) {
      throw new NotFoundException(\`${className} with ${primaryKeyName} \${${primaryKeyName}} not found\`);
    }
    
    Object.assign(${camelName}, update${className}Dto);
    return await this.${camelName}Repository.save(${camelName});
  }

  async remove(${primaryKeyName}: ${primaryKeyType}): Promise<void> {
    const result = await this.${camelName}Repository.delete(${primaryKeyName});
    if (result.affected === 0) {
      throw new NotFoundException(\`${className} with ${primaryKeyName} \${${primaryKeyName}} not found\`);
    }
  }
}
`;
}

// Plantilla para el controlador
function generateControllerTemplate(className, fileName, columns) {
  const camelName = snakeToCamel(className);
  const routeName = toLowerCase(className);
  const primaryColumn = columns.find(col => col.COLUMN_KEY === 'PRI');
  const primaryKeyName = primaryColumn ? snakeToCamel(primaryColumn.COLUMN_NAME) : 'id';
  const primaryKeyType = primaryColumn ? getTypeScriptType(primaryColumn.DATA_TYPE) : 'number';
  const parsePipe = primaryKeyType === 'number' ? 'ParseIntPipe' : 'ParseUUIDPipe';

  return `import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { ${className}Service } from './${fileName}.service';
import { ${className} } from './entities/${fileName}.entity';
import { Create${className}Dto } from './dto/create-${fileName}.dto';
import { Update${className}Dto } from './dto/update-${fileName}.dto';

@Controller('${routeName}s')
export class ${className}Controller {
  constructor(private readonly ${camelName}Service: ${className}Service) {}

  @Get()
  async findAll(): Promise<${className}[]> {
    return this.${camelName}Service.findAll();
  }

  @Get(':${primaryKeyName}')
  async findOne(@Param('${primaryKeyName}', ${parsePipe}) ${primaryKeyName}: ${primaryKeyType}): Promise<${className}> {
    return this.${camelName}Service.findOne(${primaryKeyName});
  }

  @Post()
  async create(@Body() create${className}Dto: Create${className}Dto): Promise<${className}> {
    return this.${camelName}Service.create(create${className}Dto);
  }

  @Put(':${primaryKeyName}')
  async update(
    @Param('${primaryKeyName}', ${parsePipe}) ${primaryKeyName}: ${primaryKeyType},
    @Body() update${className}Dto: Update${className}Dto,
  ): Promise<${className}> {
    return this.${camelName}Service.update(${primaryKeyName}, update${className}Dto);
  }

  @Delete(':${primaryKeyName}')
  async remove(@Param('${primaryKeyName}', ${parsePipe}) ${primaryKeyName}: ${primaryKeyType}): Promise<void> {
    return this.${camelName}Service.remove(${primaryKeyName});
  }
}
`;
}

// Función principal
async function generateResources() {
  try {
    console.log('🔍 Conectando a la base de datos...');
    console.log(`📊 Configuración: ${config.database.host}:${config.database.port}/${config.database.database}`);
    
    const connection = await mysql.createConnection({
      host: config.database.host,
      port: config.database.port,
      user: config.database.username,
      password: config.database.password,
      database: config.database.database
    });

    // Obtener lista de tablas
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [config.database.database]
    );

    console.log(`📊 Encontradas ${tables.length} tablas`);

    // Array para almacenar los módulos generados
    const generatedModules = [];

    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      
      // Obtener columnas de la tabla (CONSULTA MEJORADA)
      const [columns] = await connection.execute(
        `SELECT 
          COLUMN_NAME, 
          DATA_TYPE, 
          IS_NULLABLE, 
          COLUMN_KEY, 
          CHARACTER_MAXIMUM_LENGTH, 
          EXTRA,
          COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY ORDINAL_POSITION`,
        [config.database.database, tableName]
      );

      const className = capitalize(snakeToCamel(tableName));
      const folderName = toLowerCase(tableName);
      const fileName = toLowerCase(tableName);
      const folderPath = path.join(config.paths.baseSrc, folderName);
      const entitiesPath = path.join(folderPath, 'entities');
      const dtoPath = path.join(folderPath, 'dto');

      // Crear carpetas si no existen
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      if (!fs.existsSync(entitiesPath)) {
        fs.mkdirSync(entitiesPath, { recursive: true });
      }
      if (!fs.existsSync(dtoPath)) {
        fs.mkdirSync(dtoPath, { recursive: true });
      }

      console.log(`\n🛠️  Generando recursos para: ${tableName}`);
      console.log(`   📁 Carpeta: ${folderName}`);
      console.log(`   🏷️  Clase: ${className}`);

      // Generar entidad (en carpeta entities/)
      const entityContent = generateEntityTemplate(tableName, columns);
      fs.writeFileSync(path.join(entitiesPath, `${fileName}.entity.ts`), entityContent);

      // Generar DTOs (en carpeta dto/)
      const dtos = generateDtoTemplates(className, fileName, columns);
      fs.writeFileSync(path.join(dtoPath, `create-${fileName}.dto.ts`), dtos.createDto);
      fs.writeFileSync(path.join(dtoPath, `update-${fileName}.dto.ts`), dtos.updateDto);

      // Generar módulo
      const moduleContent = generateModuleTemplate(className, fileName);
      fs.writeFileSync(path.join(folderPath, `${fileName}.module.ts`), moduleContent);

      // Generar servicio
      const serviceContent = generateServiceTemplate(className, fileName, columns);
      fs.writeFileSync(path.join(folderPath, `${fileName}.service.ts`), serviceContent);

      // Generar controlador
      const controllerContent = generateControllerTemplate(className, fileName, columns);
      fs.writeFileSync(path.join(folderPath, `${fileName}.controller.ts`), controllerContent);

      console.log(`✅ ${className} - Recursos completos creados`);

      // Guardar el módulo generado para el archivo de barril
      generatedModules.push({
        className,
        folderName,
        fileName
      });
    }

    await connection.end();
    
    // Generar archivo de módulo principal que importa todos los módulos
    generateMainModule(generatedModules);
    
    console.log('\n🎉 ¡Todos los recursos han sido generados!');
    console.log('📁 Revisa las carpetas en src/ para cada tabla');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('💡 Ejecuta: npm install mysql2');
    }
  }
}

// Función para generar el módulo principal
function generateMainModule(modules) {
  let imports = `import { Module } from '@nestjs/common';\n`;
  let moduleImports = [];
  
  modules.forEach(module => {
    imports += `import { ${module.className}Module } from './${module.folderName}/${module.fileName}.module';\n`;
    moduleImports.push(`${module.className}Module`);
  });

  const moduleContent = `${imports}
@Module({
  imports: [
    ${moduleImports.join(',\n    ')}
  ],
})
export class GeneratedModules {}
`;

  fs.writeFileSync(path.join(config.paths.baseSrc, 'generated-modules.ts'), moduleContent);
  console.log('📦 Archivo generated-modules.ts creado');
}

// Ejecutar el generador 
generateResources();