from convex import ConvexClient, ConvexError
from pprint import pprint
# Configuration
DEPLOYMENT_URL = 'http://127.0.0.1:3210'

def send_message(client: ConvexClient, author: str, body: str, delay: int | None = None):
    """
    Send a message to the Convex backend.
    
    Args:
        client (ConvexClient): The Convex client instance.
        author (str): The author of the message.
        body (str): The content of the message.
    """
    try:
        args = dict(body=body, author=author)
        if delay is not None:
            args['delay'] = delay
        client.mutation("messages:send", args)
        print("Message sent successfully!")
    except ConvexError as err:
        print(f"Error sending message: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")

def list_messages(client: ConvexClient, limit: int = 5):
    """
    Retrieve messages from the Convex backend.
    
    Args:
        client (ConvexClient): The Convex client instance.
        limit (int): The number of messages to retrieve (default: 5).
    
    Returns:
        list: A list of message dictionaries, or None if an error occurred.
    """
    try:
        messages = client.query("messages:listN", args=dict(lastN=limit))
        return messages
    except ConvexError as err:
        print(f"Error listing messages: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
    return None

def display_messages(messages):
    """
    Display messages in a formatted manner.
    
    Args:
        messages (list): A list of message dictionaries.
    """
    if not messages:
        print("No messages to display.")
        return
    
    print("\n--- Messages ---")
    for msg in messages:
        print(f"{msg['author']}: {msg['body']}")
    print("----------------\n")


def remove_messages(client: ConvexClient):
    send_message(client, "Python pinger", "@gpt *DEL*")

def list_messages(client: ConvexClient, list_all=False, lastN = 1):
    try:
        if list_all:
            messages = client.query("messages:list")
        else:
            messages = client.query("messages:listN", args=dict(lastN=lastN))
        return messages
    except ConvexError as err:
        print(f"Error listing messages: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")
    return None

def run_tests(client: ConvexClient):
    from time import sleep
    messages = list_messages(client)
    if messages is None:
        print("Failed to list messages for testing.")
        return
    pprint(messages)
    def test_send_message(client: ConvexClient):
        send_message(client, "Test Author", "Test Message")
    def test1(client: ConvexClient):
        test_send_message(client)
        test_send_message(client)
        remove_messages(client)
        sleep(0.1)
    
    ### RUN TEST
    test1(client)
    assert messages == list_messages(client), "Test failed: Messages did not match after sending a new message."
    
def send_message_list(client: ConvexClient, messages: list[tuple[str, str]]):
    assert 0 < len(messages) <= 5, "Invalid number of messages to send."
    for author, body in messages:
        send_message(client, author, body)

def replace_with_seed_file(client: ConvexClient, seed_file: str = "pydb/seed.json"):
    import json
    seed = {}
    with open(seed_file, "r") as f:
        seed = json.load(f)
    if "data" not in seed:
        raise ValueError("Invalid seed file.")
    for doc in seed["data"]:
        # Make sure the author, body, and complete fields are present
        assert "author" in doc and "body" in doc and "complete" in doc, "Invalid seed document."
    
    print("Replacing message collection with seed data...")
    message_list = [(doc["author"], doc["body"]) for doc in seed["data"]]
    clear_table(client)
    send_message_list(client, message_list)
    print("Done.")

def get_response_from_sample(client: ConvexClient, sample: str | None = None):
    """
    Note that when a sample arg is not given, the string will be read from sample.txt

    Args:
        client (ConvexClient): _description_
        sample (str | None, optional): _description_. Defaults to None.
    """
    # Read the sample message from the file
    if sample is None:
        from os.path import exists
        if not exists("sample.txt"):
            raise FileNotFoundError("sample.txt not found")
        with open("sample.txt", "r") as file:
            sample = file.read()
    # Send an @gpt message with the sample message
    send_message(client, "Python pinger", f"@gpt {sample}")

def scan_incompletes(client: ConvexClient):
    count = client.mutation("messages:scanIncompletes")
    print(count, "incompletes found")
    return count

def clear_table(client: ConvexClient):
    client.mutation("messages:clearTableNew")

def old_main(client: ConvexClient = ConvexClient(DEPLOYMENT_URL)):
    # Initialize the ConvexClient with the provided URL
    LIST_MESSAGES = True
    LIST_ALL = False
    
    # send_message(client, "Python pinger", "A boop from mutate.py was heard...")
    send_message_list(client, [
        ("Python pinger", "1 boop from mutate.py was heard..."),
        ("Python pinger", "2 boops from mutate.py were heard..."),
        ("Python pinger", "3 boops from mutate.py were heard..."),
        ]
    )
    # remove_messages(client)
    # NOTE: If the DB is queried immediately after a user requests to remove messages,
    # the "..." GPT message will be present. This is okay, messages are scheduled to be deleted.
    
    if LIST_MESSAGES:
        # Query the 'messages:list' endpoint to get the list of messages
        if LIST_ALL:
            messages = client.query("messages:list")
        else:
            # This is a custom query that takes lastN of the top messages
            messages = client.query("messages:listN", args=dict(lastN=3))
    
        # Use the pprint module to pretty print the messages
        pprint(messages)

def test_function(client: ConvexClient):
    # get latest msg
    msg = list_messages(client, lastN=5)[0]
    print(msg)
    if not msg:
        exit("WELP")
    ref_time = msg["_creationTime"]
    res = client.query("messages:getContextMessages", args=dict(refTime=ref_time))
    print(res)

def main():
    # Initialize the ConvexClient with the provided URL
    client = ConvexClient(DEPLOYMENT_URL)
    name = None
    while True:
        print("\nOptions:")
        print("1. Display messages")
        print("2. Send a message")
        print("3. Remove last messages")
        print("4. Exit")
        
        choice = input("Enter your choice (1-4): ")
        
        if choice == '1':
            limit = int(input("Enter the number of messages to display: "))
            messages = list_messages(client, lastN = limit)
            if messages:
                display_messages(messages)
        elif choice == '2':
            if name is None:
                author = input("Enter your name: ")
                name = author
            body = input("Enter your message: ")
            send_message(client, author, body)
        elif choice == '3':
            remove_messages(client)
        elif choice == '4':
            print("Exiting the program.")
            exit()
        else:
            print("Invalid choice. Please try again.")



if __name__ == "__main__":
    client = ConvexClient(DEPLOYMENT_URL)
    # send_message(client, "Python pinger", "@gpt continue the story...", 5000)
    replace_with_seed_file(client)
    
    # test_function(client)
    # old_main(client)
    # client.mutation("messages:clearTableNew")
    # get most recent msg
    # from pyperclip import copy
    # last_message = list_messages(client)[-1]
    # copy(last_message["body"])

    # old_main()
    # remove_messages(client)
# run_tests(ConvexClient(DEPLOYMENT_URL))