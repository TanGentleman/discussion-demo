from convex import ConvexClient, ConvexError
from pprint import pprint

LOCAL_CLIENT = True
DEPLOYMENT_URL = 'http://127.0.0.1:3210'

def send_message(client: ConvexClient, author: str, body: str):
    try:
        client.mutation("messages:send", dict(body = body, author = author))
        print("Message sent successfully!")
    except ConvexError as err:
        print(f"Error sending message: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")

def remove_messages(client: ConvexClient):
    send_message(client, "Python pinger", "@gpt *DEL*")

def list_messages(client: ConvexClient, list_all=False):
    try:
        if list_all:
            messages = client.query("messages:list")
        else:
            messages = client.query("messages:list5")
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
    
    

def main():
    # Initialize the ConvexClient with the provided URL
    client = ConvexClient(DEPLOYMENT_URL)
    LIST_ALL = False
    # Query the 'messages:list' endpoint to get the list of messages
    
    # send_message(client, "Python pinger", "A boop from mutate.py was heard...")
    remove_messages(client)
    # NOTE: If the DB is queried immediately after a user requests to remove messages,
    # the "..." GPT message will be present. This is okay, messages are scheduled to be deleted.
    if LIST_ALL:
        messages = client.query("messages:list")
    else:
        messages = client.query("messages:list5")
    
    # Use the pprint module to pretty print the messages
    pprint(messages)

# main()
run_tests(ConvexClient(DEPLOYMENT_URL))