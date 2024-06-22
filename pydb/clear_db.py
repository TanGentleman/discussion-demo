import subprocess
from os.path import exists

LOCAL_AUTH_SUFFIX = "--admin-key 0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd --url 'http://127.0.0.1:3210'"

def clear_db():
    # make an empty file called empty_file.jsonl
    with open('empty_file.jsonl', 'w') as f:
        f.write('')
    # run the command to clear the database
    clear_local_db_command = f"npx convex import --replace --table messages empty_file.jsonl {LOCAL_AUTH_SUFFIX}"
    # run the command to import the empty file into the database
    subprocess.run(clear_local_db_command, shell=True)

def populate_db():
    # run the command to populate the database from full_file.jsonl
    FILEPATH = 'convex_local_storage/files/documents.jsonl'
    # check if the file exists
    if not exists(FILEPATH):
        raise Exception(f'File {FILEPATH} does not exist')
    
    populate_local_db_command = f"npx convex import --replace --table messages {FILEPATH} {LOCAL_AUTH_SUFFIX}"
    subprocess.run(populate_local_db_command, shell=True)
