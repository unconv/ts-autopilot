import OpenAI from 'openai';
import fs, { writeFile } from 'fs';

const openai = new OpenAI();

type WriteFileState = {
    type: 'write_file',
    filename: string,
};

type State = WriteFileState | null;

async function input( prompt: string ): Promise<string> {
    console.log( prompt );
    return new Promise( resolve => {
        const stdin = process.openStdin();
        stdin.addListener( "data", function( d ) {
            resolve( d.toString().trim() );
            stdin.end();
        } );
    } );
}

async function initialize() {
    if( ! fs.existsSync( 'code' ) ) {
        fs.mkdirSync( 'code' );
    }

    const files = fs.readdirSync( 'code' );
    if( files.length > 0 ) {
        console.log( "WARNING: There are files in the code directory." );

        if( await input( "Do you want to delete them? " ) === "yes" ) {
            for( const file of files ) {
                fs.rmSync( `code/${file}`, { recursive: true } );
            }
        }
    }
}

function parse_filename( message_content: string ) {
    let filename = message_content.split( "\n" )[0].split( ' ' )[1].trim();
    if( filename[0] === '<' ) {
        filename = filename.slice( 1 );
    }
    if( filename[0] === '/' ) {
        filename = filename.slice( 1 );
    }
    if( filename[0] === '"' ) {
        filename = filename.slice( 1 );
    }
    if( filename[filename.length - 1] === '"' ) {
        filename = filename.slice( 0, -1 );
    }
    if( filename[filename.length - 1] === '>' ) {
        filename = filename.slice( 0, -1 );
    }
    return filename;
}

function write_file( filename: string, file_contents: string ) {
    // Create directory if it does not exist
    const dirname = filename.split( '/' ).slice( 0, -1 ).join( '/' );
    if( ! fs.existsSync( `code/${dirname}` ) ) {
        fs.mkdirSync( `code/${dirname}`, { recursive: true } );
    }

    console.log( `Writing to file ${filename}...` );
    fs.writeFileSync( `code/${filename}`, strip_markdown( file_contents ) );
}

function strip_markdown( file_contents: string ) {
    if( file_contents.indexOf( "```" ) === 0 ) {
        file_contents = file_contents.split("\n").slice(1, -1).join("\n");
    }

    return file_contents;
}

async function main() {
    await initialize();

    let state: State = null;

    const prompt: string = await input("What do you want to create?");

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: `You are an AI assistant that can read files and write to files, and create directories in order to create complete, profession codebases.

Here are the actions you can take:
- write_file <filename>
- read_file <filename>
- create_dir <dirname>
- task_finished (call this when the whole codebase has been created)

Only perform one action per message.

When using write_file, you can write multiple lines of code. Add the code starting form the next line in the same message.

Don't use Markdown formatting in files (unless they are Markdown files)

All file and directory paths are relative from the root.

Respond only with the name of the command needed to be run next. For example, if you want to write to a file, you would respond with "write_file".
`
        },
        {
            role: 'user',
            content: prompt
        },
    ];

    while( true ) {
        const chatCompletion = await openai.chat.completions.create( {
            messages: messages,
            model: 'gpt-4',
        } );

        const message = chatCompletion.choices[0].message;
        const message_content = message.content;

        if( message_content === null ) {
            throw new Error( "Message content is null" );
        }

        console.log( "<MESSAGE_CONTENT>" + message_content + "</MESSAGE_CONTENT>" );

        messages.push( message );

        if( message_content.indexOf( 'write_file' ) === 0 ) {
            const filename = parse_filename( message_content );
            const file_contents = message_content.split( '\n' ).slice( 1 ).join( '\n' );

            if( file_contents.trim() === '' ) {
                console.log("SETTING STATE: write_file");
                state = {
                    type: 'write_file',
                    filename: filename,
                };
            } else {
                console.log("WRITING FILE DIRECTLY");
                write_file( filename, file_contents );
            }
        } else if( message_content.indexOf( 'create_dir' ) === 0 ) {
            const dirname = parse_filename( message_content );
            console.log( `Creating directory ${dirname}...` );
            fs.mkdirSync( `code/${dirname}`, { recursive: true } );
        } else if( message_content.indexOf( 'read_file' ) === 0 ) {
            const filename = parse_filename( message_content );
            // TODO
        } else if( message_content.indexOf( 'task_finished' ) === 0 ) {
            console.log("TASK FINISHED");
            break;
        } else if( state && state.type == "write_file" ) {
            console.log("WRITING FILE FROM STATE");
            write_file( state.filename, message_content );
            state = null;
        }
    }

    console.log( "Done" );
}

main();